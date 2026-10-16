/**
 * Lemon Squeezy billing: checkout, customer portal, prices and webhooks.
 * Lemon Squeezy is the merchant of record; we only store subscription state.
 * API reference: https://docs.lemonsqueezy.com/api
 */
import crypto from 'crypto';
import mongoose from 'mongoose';
import config from '../config/env.config.js';
import logger from '../config/logger.config.js';
import User from '../models/user.model.js';
import BillingEvent from '../models/billingEvent.model.js';
import AppError from '../utils/appError.util.js';
import { serializeLimits } from '../config/plans.js';
import { effectivePlan } from './quota.service.js';
import type { IUserDocument, SubscriptionStatus, UserSubscription } from '../types/user.types.js';

export type BillingInterval = 'monthly' | 'yearly';

const ls = () => config.lemonSqueezy;

const variantFor = (interval: BillingInterval) =>
  interval === 'yearly' ? ls().proYearlyVariantId : ls().proMonthlyVariantId;

/** Checkout needs the API key, store and at least one Pro variant; webhooks need the secret. */
export const isBillingConfigured = () =>
  Boolean(ls().apiKey && ls().storeId && ls().webhookSecret && (ls().proMonthlyVariantId || ls().proYearlyVariantId));

const assertConfigured = () => {
  if (!isBillingConfigured()) throw new AppError('Billing is not available yet.', 503);
};

type JsonApi<T> = { data: { id: string; type: string; attributes: T } };

const lsFetch = async <T>(path: string, init: RequestInit = {}): Promise<JsonApi<T>> => {
  let res: Response;
  try {
    res = await fetch(`${ls().apiUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${ls().apiKey}`,
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    logger.error(error, `[Billing]: Lemon Squeezy request failed: ${path}`);
    throw new AppError('The billing provider is unreachable. Please try again.', 502);
  }
  if (!res.ok) {
    logger.error({ status: res.status, body: (await res.text()).slice(0, 500) }, `[Billing]: Lemon Squeezy ${path}`);
    throw new AppError('The billing provider returned an error. Please try again.', 502);
  }
  return (await res.json()) as JsonApi<T>;
};

// ── Prices ────────────────────────────────────────────────────────────────

type Price = { amount: number; currency: string; interval: BillingInterval };
let priceCache: { at: number; prices: Partial<Record<BillingInterval, Price>> } | null = null;
const PRICE_TTL_MS = 60 * 60 * 1000;

/**
 * Pro prices as configured in Lemon Squeezy (never hard-coded here). Cached
 * for an hour; on failure returns no prices rather than guessing.
 */
const getProPrices = async () => {
  if (!isBillingConfigured()) return {};
  if (priceCache && Date.now() - priceCache.at < PRICE_TTL_MS) return priceCache.prices;
  try {
    const store = await lsFetch<{ currency: string }>(`/stores/${ls().storeId}`);
    const prices: Partial<Record<BillingInterval, Price>> = {};
    for (const interval of ['monthly', 'yearly'] as const) {
      const id = variantFor(interval);
      if (!id) continue;
      const variant = await lsFetch<{ price: number }>(`/variants/${id}`);
      prices[interval] = { amount: variant.data.attributes.price / 100, currency: store.data.attributes.currency, interval };
    }
    priceCache = { at: Date.now(), prices };
    return prices;
  } catch {
    return {};
  }
};

/** Test helper: forget cached prices. */
export const resetPriceCache = () => {
  priceCache = null;
};

export const getPlans = async () => {
  const prices = await getProPrices();
  return {
    checkoutAvailable: isBillingConfigured(),
    plans: [
      { id: 'free', limits: serializeLimits('free'), prices: {} },
      { id: 'pro', limits: serializeLimits('pro'), prices },
    ],
  };
};

// ── Checkout and portal ───────────────────────────────────────────────────

export const createCheckout = async (user: IUserDocument, interval: BillingInterval) => {
  assertConfigured();
  const variantId = variantFor(interval);
  if (!variantId) throw new AppError(`The ${interval} plan isn't available.`, 400);

  const current = await User.findById(user._id).select('plan +subscription').lean();
  if (current && effectivePlan(current) === 'pro' && current.subscription?.status !== 'cancelled') {
    throw new AppError('You already have Pro. Manage your subscription from the billing portal.', 409);
  }

  const checkout = await lsFetch<{ url: string }>('/checkouts', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email: user.email,
            name: `${user.firstName} ${user.lastName}`.trim(),
            // Echoed back in every webhook so we can find the user.
            custom: { user_id: String(user._id) },
          },
          product_options: {
            redirect_url: `${config.clientUrl}/dashboard?upgraded=1`,
          },
        },
        relationships: {
          store: { data: { type: 'stores', id: String(ls().storeId) } },
          variant: { data: { type: 'variants', id: String(variantId) } },
        },
      },
    }),
  });
  return { url: checkout.data.attributes.url };
};

/** Signed customer-portal URLs expire, so fetch a fresh one each time. */
export const getPortalUrl = async (user: IUserDocument) => {
  assertConfigured();
  const current = await User.findById(user._id).select('+subscription').lean();
  const id = current?.subscription?.lsSubscriptionId;
  if (!id) throw new AppError('You have no subscription to manage.', 404);
  const sub = await lsFetch<{ urls: { customer_portal?: string } }>(`/subscriptions/${id}`);
  const url = sub.data.attributes.urls?.customer_portal;
  if (!url) throw new AppError('The billing portal is unavailable right now.', 502);
  return { url };
};

// ── Webhooks ──────────────────────────────────────────────────────────────

/** Constant-time check of the X-Signature header (HMAC-SHA256 of the raw body). */
export const verifyWebhookSignature = (rawBody: Buffer, signature: string | undefined) => {
  const secret = ls().webhookSecret;
  if (!secret) return false;
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const sig = signature ?? '';
  return sig.length === digest.length && crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(sig));
};

type SubscriptionAttributes = {
  store_id: number;
  customer_id: number;
  variant_id: number;
  status: SubscriptionStatus;
  renews_at: string | null;
  ends_at: string | null;
  updated_at: string;
};

type InvoiceAttributes = { store_id: number; subscription_id: number; status: string; created_at: string };

type WebhookPayload = {
  meta: { event_name: string; custom_data?: { user_id?: string } };
  data: { id: string; type: string; attributes: Record<string, unknown> };
};

/** Pro while paid up (or in the grace period of a failed payment / cancellation). */
const planFor = (status: SubscriptionStatus, endsAt: Date | null): 'free' | 'pro' => {
  if (status === 'active' || status === 'on_trial' || status === 'past_due') return 'pro';
  if (status === 'cancelled') return endsAt && endsAt > new Date() ? 'pro' : 'free';
  return 'free';
};

const findUser = async (customUserId: string | undefined, subscriptionId?: string, customerId?: string) => {
  if (customUserId && mongoose.isValidObjectId(customUserId)) {
    const user = await User.findById(customUserId).select('+subscription');
    if (user) return user;
  }
  const or: Record<string, string>[] = [];
  if (subscriptionId) or.push({ 'subscription.lsSubscriptionId': subscriptionId });
  if (customerId) or.push({ 'subscription.lsCustomerId': customerId });
  return or.length ? User.findOne({ $or: or }).select('+subscription') : null;
};

export type WebhookOutcome = { result: 'applied' | 'duplicate' | 'ignored'; event: string; firstPayment?: boolean; userId?: string };

/**
 * Apply a verified webhook. Idempotent: exact redeliveries are skipped by
 * body hash, and subscription events older than the last applied one
 * (by `updated_at`) are ignored, so out-of-order delivery can't regress state.
 */
export const handleWebhook = async (rawBody: Buffer): Promise<WebhookOutcome> => {
  const digest = crypto.createHash('sha256').update(rawBody).digest('hex');
  const payload = JSON.parse(rawBody.toString('utf8')) as WebhookPayload;
  const event = payload.meta?.event_name ?? 'unknown';

  if (await BillingEvent.exists({ digest })) return { result: 'duplicate', event };

  const attrs = payload.data?.attributes ?? {};
  if (String(attrs.store_id ?? '') !== String(ls().storeId)) {
    logger.warn({ event, storeId: attrs.store_id }, '[Billing]: webhook for another store ignored');
    return { result: 'ignored', event };
  }

  let outcome: WebhookOutcome = { result: 'ignored', event };

  if (event.startsWith('subscription_') && payload.data.type === 'subscriptions') {
    const a = attrs as unknown as SubscriptionAttributes;
    const subscriptionId = String(payload.data.id);
    const user = await findUser(payload.meta.custom_data?.user_id, subscriptionId, String(a.customer_id));
    if (!user) {
      logger.warn({ event, subscriptionId }, '[Billing]: no user for subscription webhook');
      return { result: 'ignored', event };
    }
    const existing: UserSubscription = user.subscription ?? {};
    const updatedAt = new Date(a.updated_at);
    const stale =
      existing.lsSubscriptionId === subscriptionId && existing.lsUpdatedAt && updatedAt < new Date(existing.lsUpdatedAt);
    if (!stale) {
      const endsAt = a.ends_at ? new Date(a.ends_at) : null;
      const variantId = String(a.variant_id);
      user.subscription = {
        ...existing,
        lsCustomerId: String(a.customer_id),
        lsSubscriptionId: subscriptionId,
        status: a.status,
        variantId,
        interval: variantId === String(ls().proYearlyVariantId) ? 'yearly' : 'monthly',
        renewsAt: a.renews_at ? new Date(a.renews_at) : null,
        endsAt,
        lsUpdatedAt: updatedAt,
      };
      user.plan = planFor(a.status, endsAt);
      await user.save({ validateModifiedOnly: true });
      logger.info({ event, userId: user.id, status: a.status, plan: user.plan }, '[Billing]: subscription updated');
    }
    outcome = { result: stale ? 'ignored' : 'applied', event, userId: user.id };
  } else if (event === 'subscription_payment_success') {
    const a = attrs as unknown as InvoiceAttributes;
    const user = await findUser(payload.meta.custom_data?.user_id, String(a.subscription_id));
    if (user) {
      const firstPayment = !user.subscription?.lastPaymentAt;
      user.subscription = { ...(user.subscription ?? {}), lastPaymentAt: new Date(a.created_at ?? Date.now()) };
      await user.save({ validateModifiedOnly: true });
      outcome = { result: 'applied', event, firstPayment, userId: user.id };
    }
  } else if (event === 'subscription_payment_failed') {
    // The matching subscription_updated (status past_due) carries the state change.
    logger.warn({ subscriptionId: (attrs as InvoiceAttributes).subscription_id }, '[Billing]: payment failed');
  }

  await BillingEvent.create({ digest, eventName: event }).catch((error: { code?: number }) => {
    if (error.code !== 11000) throw error;
  });
  return outcome;
};
