import { beforeEach, describe, expect, it, vi } from 'vitest';
import User from '../models/user.model.js';
import Prompt from '../models/prompt.model.js';
import PromptOptimization from '../models/promptOptimization.model.js';
import { LLMError } from '../services/llm/types.js';
import { currentPeriodStart } from '../config/plans.js';
import { api, createPrompt, createUser } from './helpers.js';

// Fake models: count calls, optionally fail.
const llm = vi.hoisted(() => ({ jsonCalls: 0, streamFails: false, jsonError: null as unknown }));

vi.mock('../services/llm/registry.js', () => ({
  listAvailableModels: () => [
    { id: 'groq:llama-3.3-70b-versatile', provider: 'groq', model: 'llama-3.3-70b-versatile', label: 'Llama' },
    { id: 'google:gemini-2.5-flash', provider: 'google', model: 'gemini-2.5-flash', label: 'Gemini' },
  ],
  generate: async () => ({ text: 'unused', usage: { inputTokens: 1, outputTokens: 1 }, truncated: false }),
  stream: async (modelId: string, _opts: unknown, onDelta: (t: string) => void) => {
    if (llm.streamFails) throw new LLMError('unavailable', 'Down.', 'groq', false);
    onDelta('hi');
    return { text: 'hi', usage: { inputTokens: 1, outputTokens: 1 }, truncated: false, modelId, costUsd: 0.001, latencyMs: 1 };
  },
  generateJson: async (modelId: string) => {
    llm.jsonCalls += 1;
    if (llm.jsonError) throw llm.jsonError;
    return {
      data: {
        // Shape satisfies both the optimizer and the judge schemas.
        isValid: true,
        validationMessage: '',
        ambiguities: [],
        roleDefinition: '',
        variables: [],
        formattingConstraints: [],
        changes: ['Clarified the task'],
        rewrittenPrompt: 'Write a haiku about the ocean in three lines.',
        instructionAdherenceScore: 80,
        constraintCompliance: true,
        concisenessScore: 70,
        hallucinationRiskScore: 10,
        reasoning: 'ok',
        identifiedFailureModes: [],
      },
      usage: { inputTokens: 1, outputTokens: 1 },
      modelId,
      costUsd: 0.0001,
      latencyMs: 1,
    };
  },
}));

const quick = (cookie: string, originalPrompt = 'write a haiku about the ocean') =>
  api().post('/api/v1/prompt-optimizer/quick-optimize').set('Cookie', cookie).send({ originalPrompt, targetModel: 'Claude', mediaType: 'text' });

const usageOf = async (userId: unknown) => (await User.findById(userId).select('+usage').lean())?.usage;

const setUsage = (userId: unknown, usage: Record<string, unknown>) =>
  User.updateOne({ _id: userId }, { $set: { usage: { periodStart: currentPeriodStart(), ...usage } } });

beforeEach(() => {
  llm.jsonCalls = 0;
  llm.streamFails = false;
  llm.jsonError = null;
});

describe('monthly AI quotas', () => {
  it('counts a quick optimization against the free plan', async () => {
    const { user, cookie } = await createUser();
    expect((await quick(cookie)).status).toBe(200);
    expect((await usageOf(user._id))?.quickOptimizations).toBe(1);
  });

  it('returns 402 QUOTA_EXCEEDED at the limit without calling the model', async () => {
    const { user, cookie } = await createUser();
    await setUsage(user._id, { quickOptimizations: 20 });

    const res = await quick(cookie);
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ code: 'QUOTA_EXCEEDED', kind: 'quickOptimizations', limit: 20, plan: 'free' });
    expect(res.body.resetsAt).toBe(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString());
    expect(res.body.message).toMatch(/all 20 quick optimizations/);
    expect(llm.jsonCalls).toBe(0);
  });

  it('refunds the unit when the model call fails', async () => {
    const { user, cookie } = await createUser();
    llm.jsonError = new LLMError('rate_limited', 'Slow down.', 'groq', true);
    expect((await quick(cookie)).status).toBe(429);
    expect((await usageOf(user._id))?.quickOptimizations ?? 0).toBe(0);
  });

  it('serves repeats from the cache without a model call or a quota unit', async () => {
    const { user, cookie } = await createUser();
    const first = await quick(cookie);
    const second = await quick(cookie);
    expect(second.status).toBe(200);
    expect(second.body.data.optimization.optimizedPrompt).toBe(first.body.data.optimization.optimizedPrompt);
    expect(second.body.data.optimization.metadata.cached).toBe(true);
    expect(llm.jsonCalls).toBe(1);
    expect((await usageOf(user._id))?.quickOptimizations).toBe(1);
  });

  it('starts a fresh count in a new month', async () => {
    const { user, cookie } = await createUser();
    await User.updateOne({ _id: user._id }, { $set: { usage: { periodStart: new Date('2020-01-01'), quickOptimizations: 20 } } });
    expect((await quick(cookie)).status).toBe(200);
    const usage = await usageOf(user._id);
    expect(usage?.quickOptimizations).toBe(1);
    expect(new Date(usage!.periodStart!).getTime()).toBe(currentPeriodStart().getTime());
  });

  it('does not limit Pro quick optimizations or admins', async () => {
    const pro = await createUser({ plan: 'pro', subscription: { status: 'active' } });
    await setUsage(pro.user._id, { quickOptimizations: 5000 });
    expect((await quick(pro.cookie)).status).toBe(200);

    const admin = await createUser({ role: 'admin' });
    await setUsage(admin.user._id, { refinerySessions: 999 });
    expect((await quick(admin.cookie, 'write a limerick about cats')).status).toBe(200);
  });

  it('treats a cancelled subscription past its end date as free', async () => {
    const { user, cookie } = await createUser({
      plan: 'pro',
      subscription: { status: 'cancelled', endsAt: new Date(Date.now() - 1000) },
    });
    await setUsage(user._id, { quickOptimizations: 20 });
    expect((await quick(cookie)).status).toBe(402);
  });

  it('limits refinery sessions at the analyze step', async () => {
    const { user, cookie } = await createUser();
    await setUsage(user._id, { refinerySessions: 5 });
    const res = await api()
      .post('/api/v1/prompt-optimizer/analyze')
      .set('Cookie', cookie)
      .send({ originalPrompt: 'write a haiku about the ocean', targetModel: 'Claude', mediaType: 'text' });
    expect(res.status).toBe(402);
    expect(res.body.kind).toBe('refinerySessions');
  });
});

describe('benchmark quota', () => {
  const run = (cookie: string) =>
    api()
      .post('/api/v1/evaluations')
      .set('Cookie', cookie)
      .send({ promptText: 'Say hi', variables: {}, models: ['groq:llama-3.3-70b-versatile'] })
      .buffer(true)
      .parse((res, cb) => {
        let text = '';
        res.on('data', (c: Buffer) => (text += c));
        res.on('end', () => cb(null, text));
      });

  it('rejects with a JSON 402 before the stream opens', async () => {
    const { user, cookie } = await createUser();
    await setUsage(user._id, { benchmarkRuns: 10 });
    const res = await run(cookie);
    expect(res.status).toBe(402);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(JSON.parse(String(res.body)).kind).toBe('benchmarkRuns');
  });

  it('counts successful runs and refunds runs where every model failed', async () => {
    const { user, cookie } = await createUser();
    expect((await run(cookie)).status).toBe(200);
    expect((await usageOf(user._id))?.benchmarkRuns).toBe(1);

    llm.streamFails = true;
    expect(String((await run(cookie)).body)).toContain('"status":"failed"');
    expect((await usageOf(user._id))?.benchmarkRuns).toBe(1);
  });
});

describe('private prompt cap', () => {
  it('blocks making a 6th prompt private on the free plan', async () => {
    const { user, cookie } = await createUser();
    for (let i = 0; i < 5; i += 1) await createPrompt(user._id, { isPublic: false, title: `Private ${i}` });
    const publicPrompt = await createPrompt(user._id, { isPublic: true });

    const res = await api().patch(`/api/v1/prompts/${publicPrompt.id}`).set('Cookie', cookie).send({ isPublic: false });
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ code: 'QUOTA_EXCEEDED', kind: 'privatePrompts', limit: 5 });
    expect((await Prompt.findById(publicPrompt.id))?.isPublic).toBe(true);

    // Editing an already-private prompt is fine.
    const privateOne = await Prompt.findOne({ user: user._id, isPublic: false });
    const edit = await api().patch(`/api/v1/prompts/${privateOne!.id}`).set('Cookie', cookie).send({ title: 'Renamed private' });
    expect(edit.status).toBe(200);
  });

  it('applies to saving an optimization privately', async () => {
    const { user, cookie } = await createUser();
    const optimizationId = (await quick(cookie)).body.data.optimization._id;
    for (let i = 0; i < 5; i += 1) await createPrompt(user._id, { isPublic: false });

    const apply = (body: object) =>
      api().post(`/api/v1/prompt-optimizer/${optimizationId}/apply`).set('Cookie', cookie).send({ title: 'Haiku', sampleOutput: 'Waves', ...body });
    expect((await apply({})).status).toBe(402);
    expect((await apply({ isPublic: true })).status).toBe(201);
    expect(await PromptOptimization.countDocuments({ user: user._id })).toBe(1);
  });
});

describe('GET /billing/usage', () => {
  it('reports plan, limits and usage, with stale months shown as zero', async () => {
    const { user, cookie } = await createUser();
    await User.updateOne({ _id: user._id }, { $set: { usage: { periodStart: new Date('2020-01-01'), benchmarkRuns: 7 } } });
    await createPrompt(user._id, { isPublic: false });

    const res = await api().get('/api/v1/billing/usage').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      plan: 'free',
      limits: { quickOptimizations: 20, benchmarkRuns: 10, privatePrompts: 5 },
      usage: { benchmarkRuns: 0, quickOptimizations: 0, privatePrompts: 1 },
      subscription: null,
      billingAvailable: false,
    });
  });

  it('reports unlimited limits as null for Pro', async () => {
    const { cookie } = await createUser({ plan: 'pro', subscription: { status: 'active' } });
    const res = await api().get('/api/v1/billing/usage').set('Cookie', cookie);
    expect(res.body.data.limits).toMatchObject({ quickOptimizations: null, privatePrompts: null, benchmarkRuns: 1000 });
  });

  it('cannot be gamed through the profile update', async () => {
    const { user, cookie } = await createUser();
    await api().patch('/api/v1/user/updateProfile').set('Cookie', cookie).send({ firstName: 'Alice', plan: 'pro', usage: { quickOptimizations: -100 } });
    const fresh = await User.findById(user._id).select('+usage').lean();
    expect(fresh?.plan).toBe('free');
    expect(fresh?.usage).toBeUndefined();
  });
});
