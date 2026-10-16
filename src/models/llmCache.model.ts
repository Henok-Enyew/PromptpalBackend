import { Schema, model } from 'mongoose';

/**
 * Cached LLM results for repeatable calls (quick optimize). Keyed by a hash
 * of everything that affects the output; a TTL index expires entries.
 */
export interface ILLMCache {
  key: string;
  kind: string;
  value: unknown;
  expiresAt: Date;
}

const llmCacheSchema = new Schema<ILLMCache>(
  {
    key: { type: String, required: true, unique: true },
    kind: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

llmCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const LLMCache = model<ILLMCache>('LLMCache', llmCacheSchema);
export default LLMCache;
