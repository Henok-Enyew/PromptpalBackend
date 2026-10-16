import crypto from 'crypto';

import User from '../models/user.model.js';
import AppError from '../utils/appError.util.js';
import { sendEmail } from '../utils/email.util.js';
import { RegisterUserInput } from '../validation/auth.schema.js';
import config from '../config/env.config.js';
import logger from '../config/logger.config.js';
import { LoginUserInput } from '../validation/auth.schema.js';
import { signToken } from '../utils/jwt.util.js';
import { sanitizeUserForResponse } from '../utils/user.util.js';
import { ForgotPasswordInput } from '../validation/auth.schema.js';
import { ResetPasswordInput } from '../validation/auth.schema.js';
import { UpdatePasswordInput } from '../validation/auth.schema.js';
import googleClient from '../utils/google.util.js';

export const registerUser = async (input: RegisterUserInput) => {
  const queryConditions: any[] = [{ email: input.email }];
  
  if (input.phoneNumber) {
    queryConditions.push({ phoneNumber: input.phoneNumber });
  }

  const existingUser = await User.findOne({
    $or: queryConditions,
  });

  if (existingUser) {
    const conflictField = existingUser.email === input.email ? 'email' : 'phone number';
    throw new AppError(
      `An account with this ${conflictField} already exists.`,
      409,
    );
  }

  const user = new User(input);

  const verificationToken = user.createEmailVerificationToken();

  await user.save();

  try {
    const verificationURL = `${config.clientUrl}/verify-email?token=${verificationToken}`;
    const { getEmailVerificationTemplate, getEmailVerificationText } = await import('../utils/emailTemplates.util.js');

    await sendEmail({
      to: user.email,
      subject: 'Verify Your Email - Welcome to PromptPal!',
      text: getEmailVerificationText(verificationURL, user.firstName),
      html: getEmailVerificationTemplate(verificationURL, user.firstName),
    });
  } catch (emailError) {
    logger.error(
      emailError,
      `Failed to send verification email to ${user.email}`,
    );
  }

  return user;
};

export const verifyEmail = async (token: string) => {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationTokenExpires: { $gt: Date.now() },
  }).select('+emailVerificationToken +emailVerificationTokenExpires');

  if (!user) {
    throw new AppError('Token is invalid or has expired.', 400);
  }

  // Idempotent: already verified (e.g. React Strict Mode double-call) is success
  if (user.isEmailVerified) {
    return;
  }

  user.isEmailVerified = true;
  // Keep token until it expires so duplicate clicks / remounts stay idempotent
  await user.save({ validateBeforeSave: false });
};

export const loginUser = async (input: LoginUserInput) => {
  const user = await User.findOne({ email: input.email })
    .select(
      '+password +emailVerificationToken +emailVerificationTokenExpires +active',
    )
    .setOptions({ includeInactive: true });

  if (!user || !(await user.comparePassword(input.password))) {
    throw new AppError('Incorrect email or password.', 401);
  }

  if (!user.isEmailVerified) {
    // Always generate a new verification token and send email when user tries to login
    // This ensures they always get a fresh link
    logger.info('User email not verified - generating new verification token');
    const verificationToken = user.createEmailVerificationToken();
    logger.info(`New verification token created: ${verificationToken}`);

    await user.save();

    try {
      const verificationURL = `${config.clientUrl}/verify-email?token=${verificationToken}`;
      const { getEmailVerificationTemplate, getEmailVerificationText } = await import('../utils/emailTemplates.util.js');

      await sendEmail({
        to: user.email,
        subject: 'Verify Your Email - PromptPal',
        text: getEmailVerificationText(verificationURL, user.firstName),
        html: getEmailVerificationTemplate(verificationURL, user.firstName),
      });
      
      logger.info(`Verification email sent successfully to ${user.email}`);
    } catch (emailError) {
      logger.error(
        emailError,
        `Failed to send verification email to ${user.email}`,
      );
      // Still throw the error even if email fails, but with different message
      throw new AppError(
        'Email not verified. Failed to send verification email. Please contact support.',
        403,
      );
    }

    throw new AppError(
      'Email not verified. We have sent a new verification link to your email.',
      403,
    );
  }

  if (!user.active) {
    throw new AppError(
      'Your account is deactivated. Please contact support to reactivate.',
      403,
    );
  }

  if (user.status === 'blocked') {
    throw new AppError(
      'Your account has been blocked. Please contact support.',
      403,
    );
  }

  const token = signToken(user.id);

  const publicUser = sanitizeUserForResponse(user);

  return { token, user: publicUser };
};

export const forgotPassword = async (input: ForgotPasswordInput) => {
  const user = await User.findOne({ email: input.email }).select(
    '+passwordResetToken +passwordResetExpires',
  );

  if (!user) {
    logger.warn(
      `[Auth]: Password reset attempted for non-existent user: ${input.email}`,
    );
    return;
  }

  const resetToken = user.createPasswordResetToken();

  try {
    await user.save();
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    logger.error(err, 'Failed to save user with password reset token');
    throw new AppError('Error saving reset token. Please try again.', 500);
  }

  try {
    const resetURL = `${config.clientUrl}/reset-password?token=${resetToken}`;

    const message = `Forgot your password? Click this link to set a new one: ${resetURL}\n\nThis link is valid for 10 minutes.`;

    await sendEmail({
      to: user.email,
      subject: 'Your Password Reset Token (Valid for 10 min)',
      text: message,
      html: `<p>Forgot your password? Click the link below to set a new one:</p>
             <a href="${resetURL}" target="_blank">Reset Your Password</a>
             <p>This link is valid for 10 minutes.</p>`,
    });
  } catch (emailError) {
    logger.error(
      emailError,
      `Failed to send password reset email to ${user.email}`,
    );
    throw new AppError('Failed to send email. Please try again later.', 500);
  }
};

export const resetPassword = async (
  token: string,
  input: ResetPasswordInput,
) => {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  }).select('+passwordChangedAt');

  if (!user) {
    throw new AppError('Token is invalid or has expired.', 400);
  }

  user.password = input.password;

  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;

  await user.save();
};

export const updatePassword = async (
  userId: string,
  input: UpdatePasswordInput,
) => {
  const user = await User.findById(userId).select(
    '+password +passwordChangedAt',
  );

  if (!user) {
    throw new AppError('User not found.', 404);
  }

  if (!(await user.comparePassword(input.currentPassword))) {
    throw new AppError('Incorrect current password.', 401);
  }

  user.password = input.password;

  await user.save();

  const token = signToken(user.id);
  return token;
};

export const googleAuth = async (code: string) => {
  let idToken: string | undefined | null;
  let decodedCode: string;

  try {
    decodedCode = decodeURIComponent(code);
  } catch (err: any) {
    logger.error(
      err,
      'Failed to decode auth code. It might be severely malformed.',
    );
    throw new AppError('Malformed Google authorization code.', 400);
  }

  try {
    // Explicitly pass redirect URI to match the one used in the authorization request
    // When using @react-oauth/google with flow: 'auth-code', the redirect URI is 'postmessage'
    const { tokens } = await googleClient.getToken({
      code: decodedCode,
      redirect_uri: config.googleOAuth.redirectUri || 'postmessage',
    });
    idToken = tokens.id_token;
  } catch (err: any) {
    logger.error(err, 'Failed to exchange Google auth code for tokens');
    throw new AppError('Invalid Google authorization code.', 400);
  }

  if (!idToken) {
    throw new AppError('Could not retrieve ID token from Google.', 400);
  }

  let payload: any;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: config.googleOAuth.clientId,
    });
    payload = ticket.getPayload();
  } catch (err: any) {
    logger.error(err, 'Failed to verify Google ID token');
    throw new AppError('Invalid Google ID token.', 401);
  }

  if (!payload || !payload.sub || !payload.email) {
    throw new AppError('Invalid Google token payload.', 401);
  }

  let user = await User.findOne({
    $or: [{ googleId: payload.sub }, { email: payload.email }],
  })
    .setOptions({ includeInactive: true })
    .select('+active');

  if (user) {
    if (!user.active) {
      throw new AppError('Your account is deactivated.', 403);
    }
    if (user.status === 'blocked') {
      throw new AppError('Your account has been blocked.', 403);
    }

    if (!user.googleId) {
      user.googleId = payload.sub;
    }

    if (user.googleId && !user.isEmailVerified) {
      user.isEmailVerified = true;
    }
    await user.save();
  } else {
    user = await User.create({
      firstName: payload.given_name || 'User',
      lastName: payload.family_name || 'User',
      email: payload.email,
      googleId: payload.sub,
      profileImage: payload.picture,
      isEmailVerified: true,
      status: 'pending',
    });
  }

  const token = signToken(user.id);
  const publicUser = sanitizeUserForResponse(user);

  return { token, user: publicUser };
};
