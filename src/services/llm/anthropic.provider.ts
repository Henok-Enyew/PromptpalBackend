import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import config from '../../config/env.config.js';
import { CALL_TIMEOUT_MS, parseJsonOutput } from './json.js';
import { LLMError, type GenerateRequest, type LLMProvider, type Usage } from './types.js';

let client: Anthropic | null = null;
const getClient = () => {
  if (!config.anthropic.apiKey) throw new LLMError('unavailable', 'Anthropic is not configured.', 'anthropic');
  // Retries are handled once, in the registry, for every provider.
  client ??= new Anthropic({ apiKey: config.anthropic.apiKey, maxRetries: 0, timeout: CALL_TIMEOUT_MS });
  return client;
};

const usageOf = (message: Anthropic.Message): Usage => ({
  inputTokens: message.usage.input_tokens,
  // Includes thinking tokens, which are billed as output.
  outputTokens: message.usage.output_tokens,
});

const textOf = (message: Anthropic.Message) =>
  message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

// Current Claude models reject non-default sampling parameters, so
// `temperature` is never sent. Low effort keeps benchmark runs fast and cheap.
const baseParams = (req: GenerateRequest) => ({
  model: req.model,
  max_tokens: req.maxTokens ?? 4000,
  ...(req.system && { system: req.system }),
  messages: [{ role: 'user' as const, content: req.prompt }],
  output_config: { effort: 'low' as const },
});

const assertNotRefused = (message: Anthropic.Message) => {
  if (message.stop_reason === 'refusal') {
    throw new LLMError('refused', 'Claude declined to answer this prompt.', 'anthropic');
  }
};

const toLLMError = (error: unknown): LLMError => {
  if (error instanceof LLMError) return error;
  if (error instanceof Anthropic.APIUserAbortError) {
    return new LLMError('aborted', 'The Anthropic request was cancelled.', 'anthropic', false, { cause: error });
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new LLMError('timeout', 'The Anthropic request timed out.', 'anthropic', true, { cause: error });
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new LLMError('rate_limited', 'Anthropic rate limit reached. Try again later.', 'anthropic', true, { cause: error });
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new LLMError('auth', 'Anthropic rejected the API key.', 'anthropic', false, { cause: error });
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new LLMError('bad_request', 'Anthropic rejected the request.', 'anthropic', false, { cause: error });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new LLMError('unavailable', 'Could not reach Anthropic.', 'anthropic', true, { cause: error });
  }
  if (error instanceof Anthropic.APIError) {
    const retryable = (error.status ?? 500) >= 500;
    return new LLMError('unavailable', 'Anthropic is temporarily unavailable.', 'anthropic', retryable, { cause: error });
  }
  return new LLMError('unavailable', 'Anthropic request failed.', 'anthropic', true, { cause: error });
};

export const anthropicProvider: LLMProvider = {
  id: 'anthropic',
  label: 'Anthropic Claude',
  isConfigured: () => Boolean(config.anthropic.apiKey),
  models: () => (config.anthropic.model ? [config.anthropic.model] : []),

  async generate(req) {
    try {
      const message = await getClient().messages.create(baseParams(req), { signal: req.signal });
      assertNotRefused(message);
      return { text: textOf(message), usage: usageOf(message), truncated: message.stop_reason === 'max_tokens' };
    } catch (error) {
      throw toLLMError(error);
    }
  },

  async stream(req, onDelta) {
    try {
      const stream = getClient().messages.stream(baseParams(req), { signal: req.signal });
      stream.on('text', (delta) => onDelta(delta));
      const message = await stream.finalMessage();
      assertNotRefused(message);
      return { text: textOf(message), usage: usageOf(message), truncated: message.stop_reason === 'max_tokens' };
    } catch (error) {
      throw toLLMError(error);
    }
  },

  async generateJson<T>(req: GenerateRequest, schema: z.ZodType<T>) {
    try {
      const base = baseParams(req);
      const message = await getClient().messages.parse(
        { ...base, output_config: { ...base.output_config, format: zodOutputFormat(schema) } },
        { signal: req.signal },
      );
      assertNotRefused(message);
      // parsed_output is null when parsing failed; validate the text ourselves
      // so the error is reported consistently with other providers.
      const data = (message.parsed_output as T | null) ?? parseJsonOutput(textOf(message), schema, 'anthropic');
      return { data, usage: usageOf(message) };
    } catch (error) {
      throw toLLMError(error);
    }
  },
};
