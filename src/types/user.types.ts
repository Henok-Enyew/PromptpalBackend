import { Document, Types } from 'mongoose';
import type { Plan, UsageKind } from '../config/plans.js';

export type UserRole = 'user' | 'admin' | 'superadmin';
export type UserStatus = 'pending' | 'approved' | 'blocked';

export interface IUser {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  password: string;
  role: UserRole;
  status: UserStatus;
  active: boolean;
  profileImage?: string;

  isEmailVerified: boolean;

  createdAt: Date;
  updatedAt: Date;

  passwordChangedAt?: Date;

  emailVerificationToken?: string;
  emailVerificationTokenExpires?: Date;

  passwordResetToken?: string;
  passwordResetExpires?: Date;
  googleId?: string;
  
  // Blog bookmarks
  bookmarkedBlogs?: Types.ObjectId[];

  // Billing (Lemon Squeezy). `plan` is kept in sync by the webhook.
  plan: Plan;
  subscription?: UserSubscription;
  usage?: UserUsage;
}

export type SubscriptionStatus =
  | 'on_trial' | 'active' | 'paused' | 'past_due' | 'unpaid' | 'cancelled' | 'expired';

export interface UserSubscription {
  lsCustomerId?: string;
  lsSubscriptionId?: string;
  status?: SubscriptionStatus;
  variantId?: string;
  interval?: 'monthly' | 'yearly';
  renewsAt?: Date | null;
  endsAt?: Date | null;
  /** `updated_at` of the last applied webhook; older events are ignored. */
  lsUpdatedAt?: Date;
  lastPaymentAt?: Date;
}

export type UserUsage = { periodStart?: Date } & Partial<Record<UsageKind, number>>;

export interface PublicUserProfile {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phoneNumber?: string;
  role: string;
  status: string;
  profileImage?: string;
  isEmailVerified: boolean;
  createdAt: Date;
  plan: Plan;
}
export interface IUserDocument extends IUser, Document {
  comparePassword(candidatePassword: string): Promise<boolean>;
  hasPasswordChangedAfter(JWTTimestamp: number): boolean;

  createEmailVerificationToken(): string;
  createPasswordResetToken(): string;
  fullName: string;
}
