import { Request, Response } from 'express';
import catchAsync from '../utils/catchAsync.util.js';
import AppError from '../utils/appError.util.js';
import logger from '../config/logger.config.js';
import * as billingService from '../services/billing.service.js';
import { getUsageSummary } from '../services/quota.service.js';
import type { CheckoutInput } from '../validation/billing.schema.js';

export const getPlans = catchAsync(async (_req: Request, res: Response) => {
  res.status(200).json({ status: 'success', data: await billingService.getPlans() });
});

export const getUsage = catchAsync(async (req: Request, res: Response) => {
  const usage = await getUsageSummary(String(req.user!._id));
  res.status(200).json({ status: 'success', data: { ...usage, billingAvailable: billingService.isBillingConfigured() } });
});

export const createCheckout = catchAsync(async (req: Request, res: Response) => {
  const { interval } = req.body as CheckoutInput;
  res.status(200).json({ status: 'success', data: await billingService.createCheckout(req.user!, interval) });
});

export const getPortal = catchAsync(async (req: Request, res: Response) => {
  res.status(200).json({ status: 'success', data: await billingService.getPortalUrl(req.user!) });
});

/**
 * POST /billing/webhook, mounted in app.ts with express.raw() *before*
 * express.json so the signature is checked against the exact bytes sent.
 */
export const webhook = catchAsync(async (req: Request, res: Response) => {
  if (!billingService.isBillingConfigured()) throw new AppError('Billing is not configured.', 503);
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!billingService.verifyWebhookSignature(raw, req.get('X-Signature'))) {
    throw new AppError('Invalid signature.', 401);
  }
  let outcome: billingService.WebhookOutcome;
  try {
    outcome = await billingService.handleWebhook(raw);
  } catch (error) {
    if (error instanceof SyntaxError) throw new AppError('Malformed webhook body.', 400);
    // Non-2xx makes Lemon Squeezy retry later.
    logger.error(error, '[Billing]: webhook processing failed');
    throw new AppError('Webhook processing failed.', 500);
  }
  res.status(200).json({ status: 'success', data: { result: outcome.result } });
});
