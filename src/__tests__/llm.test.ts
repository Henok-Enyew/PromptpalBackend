import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import config from '../config/env.config.js';
import { generate, generateJson, listAvailableModels, resolveModel, stream } from '../services/llm/registry.js';
import { estimateCostUsd } from '../services/llm/pricing.js';
import { LLMError } from '../services/llm/types.js';

// All provider HTTP goes through fetch; stub it so no test can reach a real API.
const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const sse = (lines: string[]) =>
  new Response(lines.map((l) => `data: ${l}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });

const keys = { gemini: config.gemini.apiKey, groq: config.groq.apiKey, anthropic: config.anthropic.apiKey };
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  config.groq.apiKey = 'test-groq';
  config.gemini.apiKey = 'test-gemini';
  config.anthropic.apiKey = 'test-anthropic';
});
afterEach(() => {
  vi.unstubAllGlobals();
  Object.assign(config.gemini, { apiKey: keys.gemini });
  Object.assign(config.groq, { apiKey: keys.groq });
  Object.assign(config.anthropic, { apiKey: keys.anthropic });
});

describe('model registry', () => {
  it('lists only configured providers and resolves provider:model ids', () => {
    config.anthropic.apiKey = undefined;
    const ids = listAvailableModels().map((m) => m.id);
    expect(ids).toEqual(['google:gemini-2.5-flash', 'groq:llama-3.3-70b-versatile']);
    expect(resolveModel('groq:llama-3.3-70b-versatile').model).toBe('llama-3.3-70b-versatile');
    expect(() => resolveModel('nope:x')).toThrow(LLMError);
    expect(() => resolveModel('anthropic:claude-haiku-5-5')).toThrow(/not configured/);
  });

  it('estimates cost from usage and returns null for unknown models', () => {
    expect(estimateCostUsd('anthropic:claude-haiku-5-5', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(0.6);
    expect(estimateCostUsd('google:mystery', { inputTokens: 10, outputTokens: 10 })).toBeNull();
  });
});

describe('groq provider', () => {
  it('generates text with usage and cost', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 2 } }),
    );
    const res = await generate('groq:llama-3.3-70b-versatile', { prompt: 'hi' });
    expect(res).toMatchObject({ text: 'hello', usage: { inputTokens: 10, outputTokens: 2 }, truncated: false });
    expect(res.costUsd).toBeGreaterThan(0);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('api.groq.com');
    expect(init.headers.Authorization).toBe('Bearer test-groq');
  });

  it('streams deltas and picks up final usage', async () => {
    fetchMock.mockResolvedValueOnce(
      sse([
        JSON.stringify({ choices: [{ delta: { content: 'Hel' } }] }),
        JSON.stringify({ choices: [{ delta: { content: 'lo' }, finish_reason: 'stop' }] }),
        JSON.stringify({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 2 } }),
        '[DONE]',
      ]),
    );
    const deltas: string[] = [];
    const res = await stream('groq:llama-3.3-70b-versatile', { prompt: 'hi' }, (d) => deltas.push(d));
    expect(deltas).toEqual(['Hel', 'lo']);
    expect(res.text).toBe('Hello');
    expect(res.usage).toEqual({ inputTokens: 5, outputTokens: 2 });
  });

  it('retries rate limits, then succeeds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock
      .mockResolvedValueOnce(json({ error: { message: 'slow down' } }, 429))
      .mockResolvedValueOnce(json({ choices: [{ message: { content: 'ok' } }], usage: {} }));
    const res = await generate('groq:llama-3.3-70b-versatile', { prompt: 'hi' });
    expect(res.text).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('does not retry auth errors', async () => {
    fetchMock.mockResolvedValue(json({ error: { message: 'bad key' } }, 401));
    await expect(generate('groq:llama-3.3-70b-versatile', { prompt: 'hi' })).rejects.toMatchObject({ code: 'auth' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('validates JSON output against the schema', async () => {
    const schema = z.object({ score: z.number().min(0).max(100) });
    fetchMock.mockResolvedValue(json({ choices: [{ message: { content: '{"score": 140}' } }] }));
    await expect(generateJson('groq:llama-3.3-70b-versatile', { prompt: 'x', attempts: 1 }, schema)).rejects.toMatchObject({
      code: 'invalid_output',
    });
    fetchMock.mockResolvedValue(json({ choices: [{ message: { content: '```json\n{"score": 88}\n```' } }] }));
    const ok = await generateJson('groq:llama-3.3-70b-versatile', { prompt: 'x' }, schema);
    expect(ok.data).toEqual({ score: 88 });
  });
});

describe('gemini provider', () => {
  it('counts thinking tokens as output', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        candidates: [{ content: { role: 'model', parts: [{ text: 'answer' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3, thoughtsTokenCount: 5 },
      }),
    );
    const res = await generate('google:gemini-2.5-flash', { prompt: 'hi', attempts: 1 });
    expect(res.text).toBe('answer');
    expect(res.usage).toEqual({ inputTokens: 7, outputTokens: 8 });
  });
});

describe('anthropic provider', () => {
  const message = (overrides: Record<string, unknown> = {}) => ({
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content: [{ type: 'text', text: 'Hi there' }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 12, output_tokens: 4 },
    ...overrides,
  });

  it('sends no temperature and returns text with usage', async () => {
    fetchMock.mockResolvedValueOnce(json(message()));
    const res = await generate('anthropic:claude-haiku-5-5', { prompt: 'hi', temperature: 0.7, attempts: 1 });
    expect(res).toMatchObject({ text: 'Hi there', usage: { inputTokens: 12, outputTokens: 4 } });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('temperature');
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.output_config).toEqual({ effort: 'low' });
  });

  it('turns a refusal stop reason into a non-retryable error', async () => {
    fetchMock.mockResolvedValue(json(message({ content: [], stop_reason: 'refusal' })));
    await expect(generate('anthropic:claude-haiku-5-5', { prompt: 'x' })).rejects.toMatchObject({
      code: 'refused',
      retryable: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
