import type { z } from 'zod';
import logger from '../../config/logger.config.js';
import { anthropicProvider } from './anthropic.provider.js';
import { geminiProvider } from './gemini.provider.js';
import { groqProvider } from './groq.provider.js';
import { estimateCostUsd } from './pricing.js';
import {
  LLMError,
  type GenerateRequest,
  type GenerateResult,
  type LLMProvider,
  type ModelInfo,
  type ProviderId,
  type Usage,
} from './types.js';

const PROVIDERS: Record<ProviderId, LLMProvider> = {
  google: geminiProvider,
  groq: groqProvider,
  anthropic: anthropicProvider,
};

/** Models offered by this deployment (only providers with an API key). */
export const listAvailableModels = (): ModelInfo[] =>
  Object.values(PROVIDERS)
    .filter((p) => p.isConfigured())
    .flatMap((p) =>
      p.models().map((model) => ({ id: `${p.id}:${model}`, provider: p.id, model, label: `${model} (${p.label})` })),
    );

/** Resolve "provider:model" to a configured provider, or throw a 400-style error. */
export const resolveModel = (modelId: string): { provider: LLMProvider; model: string; id: string } => {
  const [providerId, ...rest] = modelId.split(':');
  const model = rest.join(':');
  const provider = PROVIDERS[providerId as ProviderId];
  if (!provider || !model) {
    throw new LLMError('bad_request', `Unknown model "${modelId}".`, (providerId as ProviderId) ?? 'google');
  }
  if (!provider.isConfigured()) {
    throw new LLMError('unavailable', `${provider.label} is not configured on this server.`, provider.id);
  }
  return { provider, model, id: `${provider.id}:${model}` };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retry retryable LLMErrors with exponential backoff (1s, 2s, ... max 5s). */
const withRetries = async <T>(label: string, attempts: number, fn: () => Promise<T>): Promise<T> => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const retryable = error instanceof LLMError && error.retryable;
      if (!retryable || attempt >= attempts) throw error;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 5000);
      logger.warn({ label, attempt, code: (error as LLMError).code }, `LLM call failed; retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
};

type CallOptions = Omit<GenerateRequest, 'model'> & { attempts?: number };
export type CostedResult = GenerateResult & { modelId: string; costUsd: number | null; latencyMs: number };

export const generate = async (modelId: string, opts: CallOptions): Promise<CostedResult> => {
  const { provider, model, id } = resolveModel(modelId);
  const started = Date.now();
  const result = await withRetries(id, opts.attempts ?? 3, () => provider.generate({ ...opts, model }));
  return { ...result, modelId: id, costUsd: estimateCostUsd(id, result.usage), latencyMs: Date.now() - started };
};

/**
 * Streamed generation. Not retried once text has been emitted (the caller
 * would see duplicated output); failures before the first token are.
 */
export const stream = async (
  modelId: string,
  opts: CallOptions,
  onDelta: (text: string) => void,
): Promise<CostedResult> => {
  const { provider, model, id } = resolveModel(modelId);
  const started = Date.now();
  let emitted = false;
  const result = await withRetries(id, opts.attempts ?? 2, async () => {
    try {
      return await provider.stream({ ...opts, model }, (delta) => {
        emitted = true;
        onDelta(delta);
      });
    } catch (error) {
      if (emitted && error instanceof LLMError) error.retryable = false;
      throw error;
    }
  });
  return { ...result, modelId: id, costUsd: estimateCostUsd(id, result.usage), latencyMs: Date.now() - started };
};

export const generateJson = async <T>(
  modelId: string,
  opts: CallOptions,
  schema: z.ZodType<T>,
): Promise<{ data: T; usage: Usage; modelId: string; costUsd: number | null; latencyMs: number }> => {
  const { provider, model, id } = resolveModel(modelId);
  const started = Date.now();
  const result = await withRetries(id, opts.attempts ?? 2, () => provider.generateJson({ ...opts, model }, schema));
  return { ...result, modelId: id, costUsd: estimateCostUsd(id, result.usage), latencyMs: Date.now() - started };
};

export { LLMError };
