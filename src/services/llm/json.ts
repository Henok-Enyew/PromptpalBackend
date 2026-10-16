import { z } from 'zod';
import { LLMError, type ProviderId } from './types.js';

/** JSON Schema for prompting/structured-output modes that take a schema. */
export const toJsonSchema = (schema: z.ZodType) => z.toJSONSchema(schema);

/**
 * Parse model text as JSON and validate it. Tolerates ```json fences, which
 * some models add even in JSON mode.
 */
export const parseJsonOutput = <T>(text: string, schema: z.ZodType<T>, provider: ProviderId): T => {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch (cause) {
    throw new LLMError('invalid_output', 'The model returned malformed JSON.', provider, true, { cause });
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new LLMError(
      'invalid_output',
      `The model's JSON didn't match the expected shape: ${z.prettifyError(result.error)}`,
      provider,
      true,
    );
  }
  return result.data;
};

/** Combine the caller's abort signal with a per-call timeout. */
export const withTimeout = (signal: AbortSignal | undefined, ms: number) =>
  signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);

export const CALL_TIMEOUT_MS = 90_000;
