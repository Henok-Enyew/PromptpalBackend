import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import config from '../config/env.config.js';
import User from '../models/user.model.js';
import { resetPriceCache } from '../services/billing.service.js';
import { api, createUser } from './helpers.js';

const LS = {
  apiKey: 'test_key',
  storeId: '111',
  webhookSecret: 'whsec_test',
  proMonthlyVariantId: '201',
  proYearlyVariantId: '202',
};
const original = { ...config.lemonSqueezy };

const configure = () => Object.assign(config.lemonSqueezy, LS);

/** Replace fetch with a fake Lemon Squeezy API and record requests. */
const fakeLemonSqueezy = () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (url.endsWith('/stores/111')) return json({ data: { id: '111', type: 'stores', attributes: { currency: 'USD' } } });
    if (url.endsWith('/variants/201')) return json({ data: { id: '201', type: 'variants', attributes: { price: 1500 } } });
    if (url.endsWith('/variants/202')) return json({ data: { id: '202', type: 'variants', attributes: { price: 14400 } } });
    if (url.endsWith('/checkouts')) return json({ data: { id: 'c1', type: 'checkouts', attributes: { url: 'https://store.lemonsqueezy.com/checkout/c1' } } });
    if (url.includes('/subscriptions/')) {
      return json({ data: { id: '9', type: 'subscriptions', attributes: { urls: { customer_portal: 'https://store.lemonsqueezy.com/billing?sig=x' } } } });
    }
    return new Response('not found', { status: 404 });
  });
  return calls;
};

const sign = (body: string, secret = LS.webhookSecret) => crypto.createHmac('sha256', secret).update(body).digest('hex');

const subscriptionEvent = (
  event: string,
  userId: string,
  attrs: Record<string, unknown> = {},
) =>
  JSON.stringify({
    meta: { event_name: event, custom_data: { user_id: userId } },
    data: {
      type: 'subscriptions',
      id: '9',
      attributes: {
        store_id: 111,
        customer_id: 77,
        variant_id: 201,
        status: 'active',
        renews_at: '2030-01-01T00:00:00.000Z',
        ends_at: null,
        updated_at: '2026-10-01T00:00:00.000Z',
        ...attrs,
      },
    },
  });

const postWebhook = (body: string, signature = sign(body)) =>
  api().post('/api/v1/billing/webhook').set('Content-Type', 'application/json').set('X-Signature', signature).send(body);

const planOf = async (id: unknown) => User.findById(id).select('plan +subscription').lean();

beforeEach(() => resetPriceCache());
afterEach(() => {
  Object.assign(config.lemonSqueezy, original);
  vi.restoreAllMocks();
});

describe('plans and checkout without billing configured', () => {
  it('lists limits but no prices, and checkout is unavailable', async () => {
    const res = await api().get('/api/v1/billing/plans');
    expect(res.status).toBe(200);
    expect(res.body.data.checkoutAvailable).toBe(false);
    const pro = res.body.data.plans.find((p: { id: string }) => p.id === 'pro');
    expect(pro.prices).toEqual({});
    expect(pro.limits.quickOptimizations).toBeNull();

    const { cookie } = await createUser();
    expect((await api().post('/api/v1/billing/checkout').set('Cookie', cookie).send({})).status).toBe(503);
    expect((await postWebhook('{}')).status).toBe(503);
  });
});

describe('with Lemon Squeezy configured', () => {
  beforeEach(configure);

  it('reads Pro prices from Lemon Squeezy', async () => {
    fakeLemonSqueezy();
    const res = await api().get('/api/v1/billing/plans');
    const pro = res.body.data.plans.find((p: { id: string }) => p.id === 'pro');
    expect(res.body.data.checkoutAvailable).toBe(true);
    expect(pro.prices.monthly).toEqual({ amount: 15, currency: 'USD', interval: 'monthly' });
    expect(pro.prices.yearly.amount).toBe(144);
  });

  it('creates a checkout carrying the user id', async () => {
    const calls = fakeLemonSqueezy();
    const { user, cookie } = await createUser();
    const res = await api().post('/api/v1/billing/checkout').set('Cookie', cookie).send({ interval: 'yearly' });

    expect(res.status).toBe(200);
    expect(res.body.data.url).toBe('https://store.lemonsqueezy.com/checkout/c1');
    const call = calls.find((c) => c.url.endsWith('/checkouts'))!;
    expect((call.init?.headers as Record<string, string>).Authorization).toBe('Bearer test_key');
    const body = JSON.parse(String(call.init?.body));
    expect(body.data.attributes.checkout_data.custom.user_id).toBe(user.id);
    expect(body.data.relationships.variant.data.id).toBe('202');
    expect(body.data.relationships.store.data.id).toBe('111');
  });

  it('refuses a second checkout for an active Pro user', async () => {
    fakeLemonSqueezy();
    const { cookie } = await createUser({ plan: 'pro', subscription: { status: 'active', lsSubscriptionId: '9' } });
    expect((await api().post('/api/v1/billing/checkout').set('Cookie', cookie).send({})).status).toBe(409);
  });

  it('returns a fresh customer portal link', async () => {
    fakeLemonSqueezy();
    const { cookie } = await createUser({ plan: 'pro', subscription: { status: 'active', lsSubscriptionId: '9' } });
    const res = await api().get('/api/v1/billing/portal').set('Cookie', cookie);
    expect(res.body.data.url).toContain('billing?sig=');

    const free = await createUser();
    expect((await api().get('/api/v1/billing/portal').set('Cookie', free.cookie)).status).toBe(404);
  });

  describe('webhooks', () => {
    it('rejects missing, wrong-secret and tampered signatures', async () => {
      const { user } = await createUser();
      const body = subscriptionEvent('subscription_created', user.id);
      expect((await postWebhook(body, '')).status).toBe(401);
      expect((await postWebhook(body, sign(body, 'other-secret'))).status).toBe(401);
      expect((await postWebhook(body.replace('"active"', '"on_trial"'), sign(body))).status).toBe(401);
      expect((await planOf(user._id))?.plan).toBe('free');
    });

    it('upgrades on subscription_created and ignores an exact redelivery', async () => {
      const { user } = await createUser();
      const body = subscriptionEvent('subscription_created', user.id);
      const first = await postWebhook(body);
      expect(first.status).toBe(200);
      expect(first.body.data.result).toBe('applied');

      const fresh = await planOf(user._id);
      expect(fresh?.plan).toBe('pro');
      expect(fresh?.subscription).toMatchObject({ lsSubscriptionId: '9', lsCustomerId: '77', status: 'active', interval: 'monthly' });

      expect((await postWebhook(body)).body.data.result).toBe('duplicate');
    });

    it('ignores events older than the last one applied', async () => {
      const { user } = await createUser();
      await postWebhook(subscriptionEvent('subscription_updated', user.id, { status: 'active', updated_at: '2026-10-05T00:00:00Z' }));
      const stale = await postWebhook(subscriptionEvent('subscription_updated', user.id, { status: 'expired', updated_at: '2026-10-02T00:00:00Z' }));
      expect(stale.body.data.result).toBe('ignored');
      expect((await planOf(user._id))?.plan).toBe('pro');
    });

    it('keeps Pro after cancellation until the period ends, then downgrades on expiry', async () => {
      const { user } = await createUser();
      await postWebhook(subscriptionEvent('subscription_created', user.id));
      await postWebhook(
        subscriptionEvent('subscription_cancelled', user.id, {
          status: 'cancelled',
          ends_at: '2030-02-01T00:00:00.000Z',
          updated_at: '2026-10-03T00:00:00.000Z',
        }),
      );
      let fresh = await planOf(user._id);
      expect(fresh?.plan).toBe('pro');
      expect(fresh?.subscription?.status).toBe('cancelled');

      await postWebhook(subscriptionEvent('subscription_expired', user.id, { status: 'expired', updated_at: '2026-10-04T00:00:00.000Z' }));
      fresh = await planOf(user._id);
      expect(fresh?.plan).toBe('free');
    });

    it('finds the user by subscription id when custom data is missing', async () => {
      const { user } = await createUser({ subscription: { lsSubscriptionId: '9', status: 'active' }, plan: 'pro' });
      const body = subscriptionEvent('subscription_updated', '', { status: 'past_due', updated_at: '2026-10-09T00:00:00Z' });
      expect((await postWebhook(body)).body.data.result).toBe('applied');
      expect((await planOf(user._id))?.subscription?.status).toBe('past_due');
    });

    it('ignores events for another store', async () => {
      const { user } = await createUser();
      const res = await postWebhook(subscriptionEvent('subscription_created', user.id, { store_id: 999 }));
      expect(res.body.data.result).toBe('ignored');
      expect((await planOf(user._id))?.plan).toBe('free');
    });

    it('records payments', async () => {
      const { user } = await createUser();
      await postWebhook(subscriptionEvent('subscription_created', user.id));
      const invoice = JSON.stringify({
        meta: { event_name: 'subscription_payment_success', custom_data: { user_id: user.id } },
        data: { type: 'subscription-invoices', id: 'inv1', attributes: { store_id: 111, subscription_id: 9, status: 'paid', created_at: '2026-10-01T00:00:00Z' } },
      });
      expect((await postWebhook(invoice)).body.data.result).toBe('applied');
      expect((await planOf(user._id))?.subscription?.lastPaymentAt).toBeTruthy();
    });

    it('rejects malformed JSON with a valid signature', async () => {
      expect((await postWebhook('not json')).status).toBe(400);
    });
  });
});

describe('account deletion with a subscription', () => {
  it('asks the user to cancel first', async () => {
    const { cookie } = await createUser({ plan: 'pro', subscription: { status: 'active', lsSubscriptionId: '9' } });
    const res = await api().delete('/api/v1/user/me').set('Cookie', cookie).send({ password: 'Password123!', confirm: 'DELETE' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Cancel your Pro subscription/);
  });
});
