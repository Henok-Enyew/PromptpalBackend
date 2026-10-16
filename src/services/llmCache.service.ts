import crypto from 'crypto';
import LLMCache from '../models/llmCache.model.js';
import logger from '../config/logger.config.js';

export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Stable key for everything that determines a model's output. */
export const cacheKey = (kind: string, parts: Record<string, unknown>) =>
  `${kind}:${crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex')}`;

/**
 * Return a cached value or compute and store it. Only use for calls where a
 * repeat of the same input may reasonably return the same answer; never for
 * streamed benchmark runs. Cache failures never fail the request.
 */
export const withLLMCache = async <T>(
  kind: string,
  parts: Record<string, unknown>,
  compute: () => Promise<T>,
  ttlMs = CACHE_TTL_MS,
): Promise<{ value: T; hit: boolean }> => {
  const key = cacheKey(kind, parts);
  try {
    const hit = await LLMCache.findOne({ key, expiresAt: { $gt: new Date() } }).lean();
    if (hit) return { value: hit.value as T, hit: true };
  } catch (error) {
    logger.warn(error, '[LLMCache]: read failed');
  }
  const value = await compute();
  try {
    await LLMCache.updateOne(
      { key },
      { $set: { kind, value, expiresAt: new Date(Date.now() + ttlMs) } },
      { upsert: true },
    );
  } catch (error) {
    logger.warn(error, '[LLMCache]: write failed');
  }
  return { value, hit: false };
};
