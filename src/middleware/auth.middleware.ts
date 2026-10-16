import { Request, Response, NextFunction } from 'express';
import { promisify } from 'util';
import Jwt from 'jsonwebtoken';
import config from '../config/env.config.js';
import User from '../models/user.model.js';
import AppError from '../utils/appError.util.js';
import catchAsync from '../utils/catchAsync.util.js';
import { UserRole } from '../types/user.types.js';

export const protect = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    let token: string | undefined;

    // Try to get token from cookie first (preferred method)
    if (req.cookies.jwt) {
      token = req.cookies.jwt;
    }
    // Fallback: get token from Authorization header (for cross-origin requests)
    else if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer ')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(
        new AppError(
          'You are not logged in. Please log in to get access.',
          401,
        ),
      );
    }

    const decoded: any = await promisify<string, string>(Jwt.verify)(
      token,
      config.jwt.secret,
    );

    const currentUser = await User.findById(decoded.id)
      .select('+passwordChangedAt +active')
      .setOptions({ includeInactive: true });

    if (!currentUser) {
      return next(
        new AppError('The user belonging to this token no longer exists.', 401),
      );
    }

    if (currentUser.hasPasswordChangedAfter(decoded.iat)) {
      return next(
        new AppError(
          'User recently changed password. Please log in again.',
          401,
        ),
      );
    }

    if (!currentUser.active) {
      return next(
        new AppError(
          'Your account is deactivated. Please contact support.',
          403,
        ),
      );
    }
    if (currentUser.status === 'blocked') {
      return next(
        new AppError('Your account has been blocked by an administrator.', 403),
      );
    }

    req.user = currentUser;
    next();
  },
);

export const optionalProtect = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    let token: string | undefined;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer ')
    ) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies.jwt) {
      token = req.cookies.jwt;
    }

    if (!token) {
      return next();
    }

    const decoded: any = await promisify<string, string>(Jwt.verify)(
      token,
      config.jwt.secret,
    );

    const currentUser = await User.findById(decoded.id)
      .select('+passwordChangedAt +active')
      .setOptions({ includeInactive: true });

    if (!currentUser) {
      return next();
    }

    if (currentUser.hasPasswordChangedAfter(decoded.iat)) {
      return next();
    }

    if (!currentUser.active || currentUser.status === 'blocked') {
      return next();
    }

    req.user = currentUser;
    return next();
  } catch (err) {
    return next();
  }
};

export const restrictTo = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to perform this action.', 403),
      );
    }
    next();
  };
};
