/**
 * USD per 1M tokens, used to estimate the cost of each call for analytics and
 * quota decisions. Provider list prices as of 2026-10; check and update when
 * models or prices change. Unknown models report a null cost rather than a
 * guess.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  'google:gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'groq:llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
  // Haiku 5.5 list price for prompts up to 100K tokens.
  'anthropic:claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'anthropic:claude-sonnet-5-5': { input: 2, output: 10 },
  'anthropic:claude-opus-5-5': { input: 4, output: 20 },
};

export const estimateCostUsd = (
  modelId: string,
  usage: { inputTokens: number; outputTokens: number },
): number | null => {
  const price = PRICES[modelId];
  if (!price) return null;
  const cost = (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
  return Math.round(cost * 1e6) / 1e6;
};
