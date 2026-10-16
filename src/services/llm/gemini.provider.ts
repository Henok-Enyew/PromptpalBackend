import { GoogleGenAI, type GenerateContentResponse } from '@google/genai';
import type { z } from 'zod';
import config from '../../config/env.config.js';
import { CALL_TIMEOUT_MS, parseJsonOutput, toJsonSchema, withTimeout } from './json.js';
import { LLMError, type GenerateRequest, type LLMProvider, type Usage } from './types.js';

let client: GoogleGenAI | null = null;
const getClient = () => {
  if (!config.gemini.apiKey) throw new LLMError('unavailable', 'Gemini is not configured.', 'google');
  client ??= new GoogleGenAI({ apiKey: config.gemini.apiKey });
  return client;
};

const usageOf = (res?: GenerateContentResponse): Usage => ({
  inputTokens: res?.usageMetadata?.promptTokenCount ?? 0,
  // Thinking tokens are billed as output.
  outputTokens: (res?.usageMetadata?.candidatesTokenCount ?? 0) + (res?.usageMetadata?.thoughtsTokenCount ?? 0),
});

const toLLMError = (error: any): LLMError => {
  if (error instanceof LLMError) return error;
  const status: number | undefined = error?.status ?? error?.code;
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
    return new LLMError(error.name === 'TimeoutError' ? 'timeout' : 'aborted', 'The Gemini request timed out or was cancelled.', 'google', error.name === 'TimeoutError', { cause: error });
  }
  if (status === 429) return new LLMError('rate_limited', 'Gemini rate limit or quota reached. Try again later.', 'google', true, { cause: error });
  if (status === 401 || status === 403) return new LLMError('auth', 'Gemini rejected the API key.', 'google', false, { cause: error });
  if (status === 400) return new LLMError('bad_request', 'Gemini rejected the request.', 'google', false, { cause: error });
  return new LLMError('unavailable', 'Gemini is temporarily unavailable.', 'google', true, { cause: error });
};

const baseParams = (req: GenerateRequest) => ({
  model: req.model,
  contents: req.prompt,
  config: {
    systemInstruction: req.system,
    maxOutputTokens: req.maxTokens ?? 4000,
    temperature: req.temperature,
    abortSignal: withTimeout(req.signal, CALL_TIMEOUT_MS),
  },
});

const checkBlocked = (res: GenerateContentResponse) => {
  if (res.promptFeedback?.blockReason) {
    throw new LLMError('refused', 'Gemini declined to answer this prompt.', 'google');
  }
};

export const geminiProvider: LLMProvider = {
  id: 'google',
  label: 'Google Gemini',
  isConfigured: () => Boolean(config.gemini.apiKey),
  models: () => (config.gemini.model ? [config.gemini.model] : []),

  async generate(req) {
    try {
      const res = await getClient().models.generateContent(baseParams(req));
      checkBlocked(res);
      return {
        text: res.text ?? '',
        usage: usageOf(res),
        truncated: res.candidates?.[0]?.finishReason === 'MAX_TOKENS',
      };
    } catch (error) {
      throw toLLMError(error);
    }
  },

  async stream(req, onDelta) {
    try {
      const stream = await getClient().models.generateContentStream(baseParams(req));
      let text = '';
      let last: GenerateContentResponse | undefined;
      for await (const chunk of stream) {
        checkBlocked(chunk);
        const delta = chunk.text ?? '';
        if (delta) {
          text += delta;
          onDelta(delta);
        }
        last = chunk;
      }
      return { text, usage: usageOf(last), truncated: last?.candidates?.[0]?.finishReason === 'MAX_TOKENS' };
    } catch (error) {
      throw toLLMError(error);
    }
  },

  async generateJson<T>(req: GenerateRequest, schema: z.ZodType<T>) {
    try {
      const params = baseParams(req);
      const res = await getClient().models.generateContent({
        ...params,
        config: { ...params.config, responseMimeType: 'application/json', responseJsonSchema: toJsonSchema(schema) },
      });
      checkBlocked(res);
      return { data: parseJsonOutput(res.text ?? '', schema, 'google'), usage: usageOf(res) };
    } catch (error) {
      throw toLLMError(error);
    }
  },
};
