import type { z } from 'zod';

export type ProviderId = 'google' | 'groq' | 'anthropic';

export interface Usage {
  inputTokens: number;
  /** Includes reasoning/thinking tokens where the provider bills them as output. */
  outputTokens: number;
}

export interface GenerateRequest {
  /** Model name without the provider prefix, e.g. "gemini-2.5-flash". */
  model: string;
  prompt: string;
  system?: string;
  maxTokens?: number;
  /** Ignored by providers/models that don't accept sampling parameters. */
  temperature?: number;
  signal?: AbortSignal;
}

export interface GenerateResult {
  text: string;
  usage: Usage;
  /** True when the output hit the token limit and may be cut off. */
  truncated: boolean;
}

export interface ModelInfo {
  /** "provider:model" */
  id: string;
  provider: ProviderId;
  model: string;
  label: string;
}

export interface LLMProvider {
  id: ProviderId;
  label: string;
  isConfigured(): boolean;
  /** Models this deployment offers for this provider (from config). */
  models(): string[];
  generate(req: GenerateRequest): Promise<GenerateResult>;
  stream(req: GenerateRequest, onDelta: (text: string) => void): Promise<GenerateResult>;
  /** Structured output validated against `schema`. */
  generateJson<T>(
    req: GenerateRequest,
    schema: z.ZodType<T>,
  ): Promise<{ data: T; usage: Usage }>;
}

export type LLMErrorCode =
  | 'rate_limited'
  | 'auth'
  | 'refused'
  | 'bad_request'
  | 'unavailable'
  | 'invalid_output'
  | 'timeout'
  | 'aborted';

/** Normalized provider error with a user-safe message. */
export class LLMError extends Error {
  constructor(
    public code: LLMErrorCode,
    message: string,
    public provider: ProviderId,
    public retryable = false,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'LLMError';
  }
}
