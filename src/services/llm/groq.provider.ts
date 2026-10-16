import type { z } from 'zod';
import config from '../../config/env.config.js';
import { CALL_TIMEOUT_MS, parseJsonOutput, toJsonSchema, withTimeout } from './json.js';
import { LLMError, type GenerateRequest, type LLMProvider, type Usage } from './types.js';

// Groq exposes an OpenAI-compatible Chat Completions API.
const URL = 'https://api.groq.com/openai/v1/chat/completions';

type GroqUsage = { prompt_tokens?: number; completion_tokens?: number } | undefined;
type GroqCompletion = {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: GroqUsage;
};
const usageOf = (u: GroqUsage): Usage => ({
  inputTokens: u?.prompt_tokens ?? 0,
  outputTokens: u?.completion_tokens ?? 0,
});

const errorFor = async (res: Response): Promise<LLMError> => {
  let detail = '';
  try {
    detail = ((await res.json()) as { error?: { message?: string } })?.error?.message ?? '';
  } catch {
    /* body not JSON */
  }
  if (res.status === 429) return new LLMError('rate_limited', 'Groq rate limit reached. Try again later.', 'groq', true);
  if (res.status === 401 || res.status === 403) return new LLMError('auth', 'Groq rejected the API key.', 'groq');
  if (res.status === 400) return new LLMError('bad_request', `Groq rejected the request${detail ? `: ${detail}` : '.'}`, 'groq');
  return new LLMError('unavailable', 'Groq is temporarily unavailable.', 'groq', true);
};

const wrapFetchError = (error: any): LLMError => {
  if (error instanceof LLMError) return error;
  if (error?.name === 'TimeoutError') return new LLMError('timeout', 'The Groq request timed out.', 'groq', true, { cause: error });
  if (error?.name === 'AbortError') return new LLMError('aborted', 'The Groq request was cancelled.', 'groq', false, { cause: error });
  return new LLMError('unavailable', 'Could not reach Groq.', 'groq', true, { cause: error });
};

const body = (req: GenerateRequest, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    model: req.model,
    messages: [
      ...(req.system ? [{ role: 'system', content: req.system }] : []),
      { role: 'user', content: req.prompt },
    ],
    max_tokens: req.maxTokens ?? 4000,
    ...(req.temperature !== undefined && { temperature: req.temperature }),
    ...extra,
  });

const post = async (req: GenerateRequest, extra?: Record<string, unknown>) => {
  if (!config.groq.apiKey) throw new LLMError('unavailable', 'Groq is not configured.', 'groq');
  const res = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.groq.apiKey}`, 'Content-Type': 'application/json' },
    body: body(req, extra),
    signal: withTimeout(req.signal, CALL_TIMEOUT_MS),
  });
  if (!res.ok) throw await errorFor(res);
  return res;
};

export const groqProvider: LLMProvider = {
  id: 'groq',
  label: 'Groq (Llama)',
  isConfigured: () => Boolean(config.groq.apiKey),
  models: () => (config.groq.model ? [config.groq.model] : []),

  async generate(req) {
    try {
      const data = (await (await post(req)).json()) as GroqCompletion;
      const choice = data?.choices?.[0];
      return { text: choice?.message?.content ?? '', usage: usageOf(data?.usage), truncated: choice?.finish_reason === 'length' };
    } catch (error) {
      throw wrapFetchError(error);
    }
  },

  async stream(req, onDelta) {
    try {
      const res = await post(req, { stream: true, stream_options: { include_usage: true } });
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      let text = '';
      let usage: GroqUsage;
      let finish: string | undefined;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          const chunk = JSON.parse(payload);
          const delta: string = chunk?.choices?.[0]?.delta?.content ?? '';
          if (delta) {
            text += delta;
            onDelta(delta);
          }
          finish = chunk?.choices?.[0]?.finish_reason ?? finish;
          // OpenAI-style final usage chunk, or Groq's x_groq.usage.
          usage = chunk?.usage ?? chunk?.x_groq?.usage ?? usage;
        }
      }
      return { text, usage: usageOf(usage), truncated: finish === 'length' };
    } catch (error) {
      throw wrapFetchError(error);
    }
  },

  async generateJson<T>(req: GenerateRequest, schema: z.ZodType<T>) {
    try {
      // JSON mode guarantees valid JSON, not the shape, so describe the
      // schema in the prompt and validate the result.
      const withSchema = {
        ...req,
        system: `${req.system ?? ''}\n\nRespond with only a JSON object matching this JSON Schema:\n${JSON.stringify(toJsonSchema(schema))}`.trim(),
      };
      const data = (await (await post(withSchema, { response_format: { type: 'json_object' } })).json()) as GroqCompletion;
      return {
        data: parseJsonOutput(data?.choices?.[0]?.message?.content ?? '', schema, 'groq'),
        usage: usageOf(data?.usage),
      };
    } catch (error) {
      throw wrapFetchError(error);
    }
  },
};
