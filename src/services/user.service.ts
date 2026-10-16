import User from '../models/user.model.js';
import { escapeRegex } from '../utils/regex.util.js';
import AppError from '../utils/appError.util.js';
import { UpdateProfileInput } from '../validation/user.schema.js';
import { UserRole, UserStatus } from '../types/user.types.js';
import { GetUsersAdminQuery } from '../validation/admin.validation.js';
import { cloudinary } from '../utils/cloudinary.util.js';
import logger from '../config/logger.config.js';
import Prompt from '../models/prompt.model.js';
import Comment from '../models/comment.model.js';
import PromptOptimization from '../models/promptOptimization.model.js';
import { DeleteAccountInput } from '../validation/user.schema.js';
import EvaluationRun from '../models/evaluationRun.model.js';

const DEFAULT_PROFILE_IMAGE =
  'https://res.cloudinary.com/dxhkryxzk/image/upload/v1755980278/avatar2_bkwawy.png';

/** Best-effort removal of a user's uploaded profile image from Cloudinary. */
const deleteProfileImage = async (imageUrl: string, userId: string) => {
  if (!imageUrl || imageUrl === DEFAULT_PROFILE_IMAGE) return;
  try {
    const match = imageUrl.match(/\/upload\/(?:v\d+\/)?(.+)/);
    const publicIdWithFolder = match?.[1]?.replace(
      /\.(jpg|jpeg|png|webp|gif)$/i,
      '',
    );
    if (publicIdWithFolder) {
      await cloudinary.api.delete_resources([publicIdWithFolder]);
      logger.info(
        `[Cloudinary]: Deleted profile image ${publicIdWithFolder} for user ${userId}`,
      );
    }
  } catch (error: any) {
    // Never block the user's action on a storage cleanup failure.
    logger.error(
      error,
      `[Cloudinary]: Failed to delete profile image for user ${userId}`,
    );
  }
};

export const updateProfile = async (
  userId: string,
  payload: UpdateProfileInput,
  oldProfileImageUrl?: string,
) => {
  // If updating profile image, delete old image from Cloudinary
  if (payload.profileImage && oldProfileImageUrl) {
    await deleteProfileImage(oldProfileImageUrl, userId);
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: payload },
    { new: true, runValidators: true },
  );

  if (!user) throw new AppError('User not found', 404);
  return user;
};

export const updateUserRole = async (
  targetUserId: string,
  newRole: UserRole,
  currentUserId: string,
) => {
  if (targetUserId === currentUserId) {
    throw new AppError('You cannot change your own role.', 400);
  }

  const user = await User.findById(targetUserId);

  if (!user) {
    throw new AppError('User not found.', 404);
  }

  user.role = newRole;
  await user.save();

  return user;
};

export const getAllUsersAdmin = async (query: GetUsersAdminQuery) => {
  const { search, role, status, page, limit } = query;

  const filter: any = {};

  if (role) filter.role = role;
  if (status) filter.status = status;

  if (search) {
    const searchRegex = new RegExp(escapeRegex(String(search)), 'i');
    filter.$or = [
      { firstName: searchRegex },
      { lastName: searchRegex },
      { email: searchRegex },
      { phoneNumber: searchRegex },
    ];
  }

  const skip = (page - 1) * limit;

  const users = await User.find(filter)
    .setOptions({ includeInactive: true })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('+status +active');

  const totalUsers = await User.countDocuments(filter).setOptions({
    includeInactive: true,
  });

  return {
    users,
    totalPages: Math.ceil(totalUsers / limit),
    currentPage: page,
    totalUsers,
  };
};

export const updateUserStatus = async (userId: string, status: UserStatus) => {
  const user = await User.findById(userId).setOptions({
    includeInactive: true,
  });

  if (!user) {
    throw new AppError('User not found.', 404);
  }

  if (user.role === 'superadmin' && status === 'blocked') {
    throw new AppError('You cannot block a Superadmin.', 403);
  }

  user.status = status;
  await user.save();

  return user;
};

export const getUserByIdAdmin = async (userId: string) => {
  const user = await User.findById(userId)
    .setOptions({ includeInactive: true })
    .select('+active +status');

  if (!user) {
    throw new AppError('User not found.', 404);
  }

  return { user };
};

/**
 * Self-service account deletion (GDPR "right to erasure").
 * Soft-deletes the user's prompts and comments, removes their optimizer
 * history, and anonymizes the account so the email can be reused.
 */
export const deleteAccount = async (userId: string, input: DeleteAccountInput) => {
  const user = await User.findById(userId).select('+password +subscription');
  if (!user) throw new AppError('User not found', 404);

  // Deleting the account wouldn't stop Lemon Squeezy from charging the card.
  const liveStatuses = ['active', 'on_trial', 'past_due', 'paused', 'unpaid'];
  if (user.subscription?.status && liveStatuses.includes(user.subscription.status)) {
    throw new AppError(
      'Cancel your Pro subscription in the billing portal before deleting your account.',
      409,
    );
  }

  if (user.password) {
    if (!input.password || !(await user.comparePassword(input.password))) {
      throw new AppError('Incorrect password.', 401);
    }
  }

  const now = new Date();
  await Promise.all([
    Prompt.updateMany(
      { user: user._id, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: now, isPublic: false } },
    ),
    Comment.updateMany(
      { user: user._id, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: now } },
    ),
    PromptOptimization.deleteMany({ user: user._id }),
    EvaluationRun.deleteMany({ user: user._id }),
  ]);

  await deleteProfileImage(user.profileImage ?? '', userId);

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        firstName: 'Deleted',
        lastName: 'User',
        email: `deleted-${user.id}@deleted.promptpal.invalid`,
        profileImage: DEFAULT_PROFILE_IMAGE,
        active: false,
        passwordChangedAt: now,
      },
      $unset: { password: 1, phoneNumber: 1, googleId: 1 },
    },
  );

  logger.info(`[User]: Account ${userId} deleted by its owner`);
};
