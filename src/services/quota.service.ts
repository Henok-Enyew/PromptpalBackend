import { Types } from 'mongoose';
import User from '../models/user.model.js';
import Prompt from '../models/prompt.model.js';
import AppError from '../utils/appError.util.js';
import {
  PLAN_LIMITS,
  QUOTA_LABELS,
  USAGE_KINDS,
  currentPeriodStart,
  nextPeriodStart,
  serializeLimits,
  type Plan,
  type QuotaKind,
  type UsageKind,
} from '../config/plans.js';
import type { UserSubscription } from '../types/user.types.js';

type PlanSource = { plan?: Plan; role?: string; subscription?: UserSubscription | null };

/** Admins run the service; quotas don't apply to them. */
export const isStaff = (user: { role?: string }) => user.role === 'admin' || user.role === 'superadmin';

/**
 * Plan the user is entitled to right now. A cancelled subscription stays Pro
 * until its paid period ends, even if the "expired" webhook never arrives.
 */
export const effectivePlan = (user: PlanSource, now = new Date()): Plan => {
  if (user.plan !== 'pro') return 'free';
  const sub = user.subscription;
  if (sub?.status === 'cancelled' && sub.endsAt && new Date(sub.endsAt) <= now) return 'free';
  if (sub?.status === 'expired') return 'free';
  return 'pro';
};

const freshCounters = (periodStart: Date) => ({
  periodStart,
  ...Object.fromEntries(USAGE_KINDS.map((k) => [k, 0])),
});

/** Zero the counters if they belong to an earlier month (atomic, idempotent). */
const rollPeriod = async (userId: string) => {
  const period = currentPeriodStart();
  await User.updateOne(
    {
      _id: userId,
      $or: [{ 'usage.periodStart': { $lt: period } }, { 'usage.periodStart': { $exists: false } }],
    },
    { $set: { usage: freshCounters(period) } },
  );
};

export const quotaExceededError = (kind: QuotaKind, plan: Plan, limit: number) => {
  const label = QUOTA_LABELS[kind];
  const resetsAt = nextPeriodStart();
  const when = resetsAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
  const message =
    kind === 'privatePrompts'
      ? `Your ${plan === 'free' ? 'Free' : 'Pro'} plan includes ${limit} private prompts. Make this prompt public, delete a private one, or upgrade.`
      : plan === 'free'
        ? `You've used all ${limit} ${label} in the Free plan this month. Upgrade to Pro, or wait until ${when} when it resets.`
        : `You've used all ${limit} ${label} in your plan this month. It resets on ${when}.`;
  return new AppError(message, 402, {
    code: 'QUOTA_EXCEEDED',
    kind,
    limit,
    plan,
    resetsAt: kind === 'privatePrompts' ? null : resetsAt.toISOString(),
  });
};

/**
 * Reserve one unit of `kind` for the user, or throw 402. Reserve-then-refund
 * (instead of count-after) keeps concurrent requests from overshooting.
 * Returns a refund function; call it if the work fails.
 */
export const reserveUsage = async (user: { id: string; role?: string }, kind: UsageKind) => {
  if (isStaff(user)) return async () => {};

  const doc = await User.findById(user.id).select('plan role +subscription').lean();
  if (!doc) throw new AppError('User not found.', 401);
  const plan = effectivePlan(doc as PlanSource);
  const limit = PLAN_LIMITS[plan][kind];

  await rollPeriod(user.id);
  const path = `usage.${kind}`;
  const filter: Record<string, unknown> = { _id: user.id };
  if (Number.isFinite(limit)) filter[path] = { $lt: limit };
  const updated = await User.findOneAndUpdate(filter, { $inc: { [path]: 1 } }, { projection: { _id: 1 } });
  if (!updated) throw quotaExceededError(kind, plan, limit);

  let refunded = false;
  return async () => {
    if (refunded) return;
    refunded = true;
    await User.updateOne({ _id: user.id, [path]: { $gt: 0 } }, { $inc: { [path]: -1 } });
  };
};

/** Throw 402 if the user can't keep another private prompt. */
export const assertPrivatePromptAllowed = async (userId: string, excludePromptId?: string) => {
  const doc = await User.findById(userId).select('plan role +subscription').lean();
  if (!doc || isStaff(doc)) return;
  const plan = effectivePlan((doc ?? {}) as PlanSource);
  const limit = PLAN_LIMITS[plan].privatePrompts;
  if (!Number.isFinite(limit)) return;
  const filter: Record<string, unknown> = { user: userId, isPublic: false, isDeleted: { $ne: true } };
  if (excludePromptId) filter._id = { $ne: new Types.ObjectId(excludePromptId) };
  if ((await Prompt.countDocuments(filter)) >= limit) throw quotaExceededError('privatePrompts', plan, limit);
};

/** Plan, limits and this month's usage for the billing/usage screen. */
export const getUsageSummary = async (userId: string) => {
  const doc = await User.findById(userId).select('plan role +subscription +usage').lean();
  if (!doc) throw new AppError('User not found.', 404);
  const plan = effectivePlan(doc as PlanSource);
  const period = currentPeriodStart();
  const stale = !doc.usage?.periodStart || new Date(doc.usage.periodStart) < period;
  const usage = Object.fromEntries(USAGE_KINDS.map((k) => [k, stale ? 0 : (doc.usage?.[k] ?? 0)])) as Record<QuotaKind, number>;
  usage.privatePrompts = await Prompt.countDocuments({ user: userId, isPublic: false, isDeleted: { $ne: true } });

  const sub = doc.subscription;
  return {
    plan,
    unlimited: isStaff(doc),
    limits: serializeLimits(plan),
    usage,
    periodStart: period.toISOString(),
    resetsAt: nextPeriodStart().toISOString(),
    subscription: sub?.status
      ? {
          status: sub.status,
          interval: sub.interval ?? null,
          renewsAt: sub.renewsAt ?? null,
          endsAt: sub.endsAt ?? null,
        }
      : null,
  };
};
