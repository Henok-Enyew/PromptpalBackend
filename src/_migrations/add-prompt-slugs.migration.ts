/**
 * Migration: backfill Prompt.slug and Prompt.likesCount
 *
 * - slug: stable public URL key (/prompts/:slug) for prompts created before
 *   slugs existed.
 * - likesCount: denormalized likes.length used for server-side feed sorting.
 *
 * Idempotent: only touches prompts missing a slug or whose likesCount is out
 * of sync. Run `pnpm migrate:prompt-slugs --dry-run` first.
 */

import mongoose from 'mongoose';
import config from '../config/env.config.js';
import Prompt from '../models/prompt.model.js';
import logger from '../config/logger.config.js';
import { generateUniqueSlug } from '../utils/slug.util.js';

const dryRun = process.argv.includes('--dry-run');
const BATCH_SIZE = 500;

const connectDB = async () => {
  const dbUrl = config.mongo.uriTemplate.replace('<PASSWORD>', config.mongo.password);
  await mongoose.connect(dbUrl);
  logger.info(`[Migration]: MongoDB connected${dryRun ? ' (dry run)' : ''}`);
};

export const migratePromptSlugs = async () => {
  const filter = {
    $or: [
      { slug: { $exists: false } },
      { slug: null },
      { $expr: { $ne: ['$likesCount', { $size: { $ifNull: ['$likes', []] } }] } },
    ],
  };

  const cursor = Prompt.find(filter, 'title slug likes likesCount').lean().cursor();
  let ops: any[] = [];
  let matched = 0;
  let written = 0;

  const flush = async () => {
    if (ops.length === 0) return;
    if (!dryRun) {
      const result = await Prompt.bulkWrite(ops, { ordered: false });
      written += result.modifiedCount;
    }
    ops = [];
  };

  for await (const prompt of cursor) {
    matched += 1;
    const $set: Record<string, unknown> = {
      likesCount: prompt.likes?.length ?? 0,
    };
    if (!prompt.slug) {
      $set.slug = await generateUniqueSlug(prompt.title || 'prompt', Prompt);
    }
    ops.push({ updateOne: { filter: { _id: prompt._id }, update: { $set } } });
    if (ops.length >= BATCH_SIZE) await flush();
  }
  await flush();

  logger.info(
    `[Migration]: ${matched} prompt(s) needed updates; ${dryRun ? 'dry run, nothing written' : `${written} updated`}`,
  );
  return { matched, written };
};

// Run directly (not when imported by tests)
if (process.argv[1]?.includes('add-prompt-slugs.migration')) {
  try {
    await connectDB();
    await migratePromptSlugs();
    // Add the new slug/likesCount indexes (never drops any). Skipped on dry runs.
    if (!dryRun) await Prompt.createIndexes();
    logger.info('[Migration]: ✅ Done');
  } catch (err) {
    logger.error(err, '[Migration]: ❌ Failed');
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
