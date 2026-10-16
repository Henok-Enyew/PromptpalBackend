import { Request, Response, NextFunction } from 'express';
import catchAsync from '../utils/catchAsync.util.js';
import logger from '../config/logger.config.js';
import { reserveUsage } from '../services/quota.service.js';
import type { UsageKind } from '../config/plans.js';

/**
 * Reserve one unit of the user's monthly `kind` quota before an LLM call;
 * 402 QUOTA_EXCEEDED when it's used up. Error responses (status >= 400) are
 * refunded automatically; streaming handlers call `res.locals.refundQuota()`
 * themselves when a run fails after the 200 is sent. Use after `protect`.
 */
export const requireQuota = (kind: UsageKind) =>
  catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const refund = await reserveUsage({ id: String(req.user!._id), role: req.user!.role }, kind);
    res.locals.refundQuota = refund;
    res.on('finish', () => {
      if (res.statusCode >= 400) {
        refund().catch((error) => logger.error(error, `[Quota]: refund of ${kind} failed`));
      }
    });
    next();
  });
