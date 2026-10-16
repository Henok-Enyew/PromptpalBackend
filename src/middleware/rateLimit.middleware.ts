import { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import config from '../config/env.config.js';

// In-memory stores: correct for a single Render instance. Move to a shared
// store (Upstash Redis) before running more than one instance.

const message = (text: string) => ({ status: 'fail', message: text });

/** Baseline protection for every /api route, per IP. */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.rateLimit.globalMax,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: message('Too many requests. Please try again in a few minutes.'),
});

/**
 * Credential endpoints (login, register, Google sign-in, password reset), per IP.
 * Successful requests don't count, so normal sign-ins are never blocked.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.rateLimit.authMax,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: message(
    'Too many attempts. Please wait 15 minutes before trying again.',
  ),
});

/**
 * Routes that call an LLM. Keyed by user when authenticated (mount after
 * `protect`), otherwise by IP, to cap inference spend per account.
 */
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: config.rateLimit.aiMax,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req: Request) =>
    req.user ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip ?? '')}`,
  message: message(
    'You have reached the hourly limit for AI requests. Please try again later.',
  ),
});
