/**
 * Plan limits: the single source of truth for quotas. The pricing page reads
 * these through GET /billing/plans, so change them here only.
 * Counters reset at the start of each calendar month (UTC).
 */
export type Plan = 'free' | 'pro';
export type UsageKind = 'quickOptimizations' | 'refinerySessions' | 'benchmarkRuns';
export type QuotaKind = UsageKind | 'privatePrompts';

export const USAGE_KINDS: UsageKind[] = ['quickOptimizations', 'refinerySessions', 'benchmarkRuns'];

export const PLAN_LIMITS: Record<Plan, Record<QuotaKind, number>> = {
  free: { quickOptimizations: 20, refinerySessions: 5, benchmarkRuns: 10, privatePrompts: 5 },
  pro: { quickOptimizations: Infinity, refinerySessions: 250, benchmarkRuns: 1000, privatePrompts: Infinity },
};

export const QUOTA_LABELS: Record<QuotaKind, string> = {
  quickOptimizations: 'quick optimizations',
  refinerySessions: 'refinery sessions',
  benchmarkRuns: 'benchmark runs',
  privatePrompts: 'private prompts',
};

/** Start of the current usage period: the first day of this month, UTC. */
export const currentPeriodStart = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/** When the current period's counters reset. */
export const nextPeriodStart = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

/** JSON can't carry Infinity; the API reports unlimited as null. */
export const serializeLimits = (plan: Plan) =>
  Object.fromEntries(
    Object.entries(PLAN_LIMITS[plan]).map(([k, v]) => [k, Number.isFinite(v) ? v : null]),
  ) as Record<QuotaKind, number | null>;
