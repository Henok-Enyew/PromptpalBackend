import { Request, Response, NextFunction } from 'express';
import config from '../config/env.config.js';
import AppError from '../utils/appError.util.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence in depth (on top of SameSite cookies): browsers always attach
 * an Origin header to cross-site state-changing requests, so reject any whose
 * Origin isn't one of our frontends. Requests without an Origin (curl, server
 * to server, webhooks, CLI) carry no ambient browser cookies and pass through.
 */
export const originCheck = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const origin = req.get('origin');
  if (SAFE_METHODS.has(req.method) || !origin) return next();
  if (config.corsOrigin.includes(origin)) return next();
  return next(new AppError('Cross-site request blocked.', 403));
};
