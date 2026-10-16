/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - firstName
 *         - lastName
 *         - email
 *       properties:
 *         _id:
 *           type: string
 *           description: User ID
 *           example: 507f1f77bcf86cd799439011
 *         firstName:
 *           type: string
 *           minLength: 2
 *           maxLength: 50
 *           description: User's first name
 *           example: John
 *         lastName:
 *           type: string
 *           minLength: 2
 *           maxLength: 50
 *           description: User's last name
 *           example: Doe
 *         email:
 *           type: string
 *           format: email
 *           description: User's email address
 *           example: john.doe@example.com
 *         phoneNumber:
 *           type: string
 *           description: User's phone number (optional)
 *           example: "+251911234567"
 *         role:
 *           type: string
 *           enum: [user, admin, superadmin]
 *           default: user
 *           description: User role
 *         status:
 *           type: string
 *           enum: [pending, approved, blocked]
 *           default: pending
 *           description: User account status
 *         profileImage:
 *           type: string
 *           description: URL to user's profile image
 *           example: https://res.cloudinary.com/dxhkryxzk/image/upload/v1755980278/avatar2_bkwawy.png
 *         isEmailVerified:
 *           type: boolean
 *           default: false
 *           description: Email verification status
 *         googleId:
 *           type: string
 *           description: Google OAuth ID
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Account creation timestamp
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 */
import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import validator from 'validator';
import mongooseSanitize from 'mongoose-sanitize';
import { IUserDocument, UserRole, UserStatus } from '../types/user.types.js';

const DEFAULT_PROFILE_IMAGE =
  'https://res.cloudinary.com/dxhkryxzk/image/upload/v1755980278/avatar2_bkwawy.png';

const userSchema = new Schema<IUserDocument>(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required.'],
      set: (val: string) => val.trim(),
      minlength: [2, 'First name must be at least 2 characters.'],
      maxlength: [50, 'First name cannot exceed 50 characters.'],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required.'],
      set: (val: string) => val.trim(),
      minlength: [2, 'Last name must be at least 2 characters.'],
      maxlength: [50, 'Last name cannot exceed 50 characters.'],
    },
    email: {
      type: String,
      required: [true, 'Email is required.'],
      set: (val: string) => val.toLowerCase().trim(),
      validate: [validator.isEmail, 'Please provide a valid email address.'],
    },
    phoneNumber: {
      type: String,
      required: false,
      trim: true,
    },
    password: {
      type: String,
      required: [
        function (this: IUserDocument) {
          return !this.googleId;
        },
        'Password is required for email/password sign-ups.',
      ],
      validate: {
        validator: function (value: string) {
          if (!value) return true;
          return validator.isStrongPassword(value, {
            minLength: 8,
            minLowercase: 1,
            minUppercase: 1,
            minNumbers: 1,
            minSymbols: 0,
          });
        },
        message:
          'Password must be at least 8 characters, with 1 uppercase letter, 1 lowercase letter, and 1 number.',
      },
      select: false,
    },
    role: {
      type: String,
      enum: {
        values: ['user', 'admin', 'superadmin'] as UserRole[],
        message: 'Role is either: user, admin, or superadmin',
      },
      default: 'user',
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'approved', 'blocked'] as UserStatus[],
        message: 'Status is either: pending, approved, or blocked',
      },
      default: 'pending',
    },
    profileImage: {
      type: String,
      required: false,
      default: DEFAULT_PROFILE_IMAGE,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    active: {
      type: Boolean,
      default: true,
      select: false,
    },
    googleId: {
      type: String,
    },

    passwordChangedAt: {
      type: Date,
      select: false,
    },
    emailVerificationToken: {
      type: String,
      select: false,
    },
    emailVerificationTokenExpires: {
      type: Date,
      select: false,
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    // Blog bookmarks
    bookmarkedBlogs: [
      {
        type: Schema.Types.ObjectId,
        ref: 'BlogPost',
      },
    ],
    // Billing. `plan` is written only by the Lemon Squeezy webhook handler.
    plan: {
      type: String,
      enum: ['free', 'pro'],
      default: 'free',
    },
    subscription: {
      type: {
        _id: false,
        lsCustomerId: String,
        lsSubscriptionId: String,
        status: {
          type: String,
          enum: ['on_trial', 'active', 'paused', 'past_due', 'unpaid', 'cancelled', 'expired'],
        },
        variantId: String,
        interval: { type: String, enum: ['monthly', 'yearly'] },
        renewsAt: Date,
        endsAt: Date,
        lsUpdatedAt: Date,
        lastPaymentAt: Date,
      },
      select: false,
    },
    // Monthly usage counters; reset lazily by the quota middleware.
    usage: {
      type: {
        _id: false,
        periodStart: Date,
        quickOptimizations: { type: Number, default: 0 },
        refinerySessions: { type: Number, default: 0 },
        benchmarkRuns: { type: Number, default: 0 },
      },
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

userSchema.plugin(mongooseSanitize);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ phoneNumber: 1 }, { unique: true, sparse: true });
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });
userSchema.index({ firstName: 1, lastName: 1 });

userSchema.index({ role: 1, status: 1 });
userSchema.index({ 'subscription.lsSubscriptionId': 1 }, { sparse: true });

userSchema.index({
  firstName: 'text',
  lastName: 'text',
  email: 'text',
});

userSchema.virtual('fullName').get(function (this: IUserDocument) {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  if (!this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  if (!this.isNew) {
    this.passwordChangedAt = new Date(Date.now() - 1000);
  }
  next();
});

userSchema.pre(/^find/, function (this: any, next) {
  if (this.getOptions().includeInactive === true) {
    return next();
  }
  this.find({ active: { $ne: false } });
  next();
});

userSchema.methods.comparePassword = async function (
  candidatePassword: string,
): Promise<boolean> {
  const user = await User.findById(this._id).select('+password');
  if (!user || !user.password) return false;
  return await bcrypt.compare(candidatePassword, user.password);
};

userSchema.methods.hasPasswordChangedAfter = function (
  JWTTimestamp: number,
): boolean {
  if (this.passwordChangedAt) {
    const changedTimestamp = this.passwordChangedAt.getTime() / 1000;
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

userSchema.methods.createEmailVerificationToken = function (): string {
  const verificationToken = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
  this.emailVerificationTokenExpires = new Date(
    Date.now() + 24 * 60 * 60 * 1000,
  );
  return verificationToken;
};

userSchema.methods.createPasswordResetToken = function (): string {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  this.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000);
  return resetToken;
};

const User = mongoose.model<IUserDocument>('User', userSchema);

export default User;
