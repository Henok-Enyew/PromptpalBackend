import { Document, Types } from 'mongoose';

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
}

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
}
export interface IUserDocument extends IUser, Document {
  comparePassword(candidatePassword: string): Promise<boolean>;
  hasPasswordChangedAfter(JWTTimestamp: number): boolean;

  createEmailVerificationToken(): string;
  createPasswordResetToken(): string;
  fullName: string;
}
