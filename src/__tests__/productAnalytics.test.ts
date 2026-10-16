import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import config from '../config/env.config.js';
import { api, createUser } from './helpers.js';

const captured = vi.hoisted(() => [] as { distinctId: string; event: string; properties?: Record<string, unknown> }[]);

vi.mock('posthog-node', () => ({
  PostHog: class {
    capture(message: (typeof captured)[number]) {
      captured.push(message);
    }
    async shutdown() {}
  },
}));

const SECRET = 'whsec_analytics';
const original = { ls: { ...config.lemonSqueezy }, ph: { ...config.posthog } };

const post = (body: string) =>
  api()
    .post('/api/v1/billing/webhook')
    .set('Content-Type', 'application/json')
    .set('X-Signature', crypto.createHmac('sha256', SECRET).update(body).digest('hex'))
    .send(body);

const subscription = (event: string, userId: string, status: string, updatedAt: string) =>
  JSON.stringify({
    meta: { event_name: event, custom_data: { user_id: userId } },
    data: {
      type: 'subscriptions',
      id: '9',
      attributes: { store_id: 111, customer_id: 7, variant_id: 202, status, renews_at: null, ends_at: '2030-01-01T00:00:00Z', updated_at: updatedAt },
    },
  });

const payment = (userId: string, id: string) =>
  JSON.stringify({
    meta: { event_name: 'subscription_payment_success', custom_data: { user_id: userId } },
    data: { type: 'subscription-invoices', id, attributes: { store_id: 111, subscription_id: 9, status: 'paid', created_at: '2026-10-01T00:00:00Z' } },
  });

beforeEach(() => {
  captured.length = 0;
  Object.assign(config.lemonSqueezy, { apiKey: 'k', storeId: '111', webhookSecret: SECRET, proMonthlyVariantId: '201', proYearlyVariantId: '202' });
  config.posthog.apiKey = 'phc_test';
});
afterEach(() => {
  Object.assign(config.lemonSqueezy, original.ls);
  Object.assign(config.posthog, original.ph);
});

describe('server-side product events', () => {
  it('sends checkout_completed_pro on the first payment only, keyed by user id, without PII', async () => {
    const { user } = await createUser();
    await post(subscription('subscription_created', user.id, 'active', '2026-10-01T00:00:00Z'));
    await post(payment(user.id, 'inv-1'));
    await post(payment(user.id, 'inv-2'));

    const checkouts = captured.filter((c) => c.event === 'checkout_completed_pro');
    expect(checkouts).toHaveLength(1);
    expect(checkouts[0]).toMatchObject({ distinctId: user.id, properties: { interval: 'yearly', source: 'server' } });
    expect(JSON.stringify(captured)).not.toContain(user.email);
  });

  it('sends subscription_cancelled once when a subscription is cancelled', async () => {
    const { user } = await createUser();
    await post(subscription('subscription_created', user.id, 'active', '2026-10-01T00:00:00Z'));
    await post(subscription('subscription_cancelled', user.id, 'cancelled', '2026-10-02T00:00:00Z'));
    await post(subscription('subscription_updated', user.id, 'cancelled', '2026-10-03T00:00:00Z'));
    expect(captured.filter((c) => c.event === 'subscription_cancelled')).toHaveLength(1);
  });

  it('sends nothing when PostHog is not configured', async () => {
    config.posthog.apiKey = undefined;
    const { user } = await createUser();
    await post(subscription('subscription_created', user.id, 'active', '2026-10-01T00:00:00Z'));
    await post(payment(user.id, 'inv-3'));
    expect(captured).toHaveLength(0);
  });
});
