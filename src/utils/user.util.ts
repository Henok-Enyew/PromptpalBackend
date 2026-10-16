import { IUserDocument, PublicUserProfile } from '../types/user.types.js';

/**
 * Fields that may be shown about a user to anyone else (authors of prompts,
 * comments, blog posts). Never add email, phone number or auth fields here.
 */
export const PUBLIC_AUTHOR_FIELDS = 'firstName lastName profileImage';

export const sanitizeUserForResponse = (
  user: IUserDocument,
): PublicUserProfile => {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: user.fullName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    role: user.role,
    status: user.status,
    profileImage: user.profileImage,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
    plan: user.plan ?? 'free',
  };
};
