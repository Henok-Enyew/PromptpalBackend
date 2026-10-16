/**
 * Migration: backfill Prompt.versions (v1) and Prompt.currentVersion
 *
 * Prompts created before version history existed get a single version 1
 * holding their current text. Idempotent; run with --dry-run first:
 *   pnpm migrate:prompt-versions --dry-run
 */

import mongoose from 'mongoose';
import config from '../config/env.config.js';
import Prompt from '../models/prompt.model.js';
import logger from '../config/logger.config.js';
import { extractTemplateVariables } from '../utils/template.util.js';

const dryRun = process.argv.includes('--dry-run');
const BATCH_SIZE = 500;

export const migratePromptVersions = async () => {
  const cursor = Prompt.find(
    { 'versions.0': { $exists: false } },
    'promptText user createdAt',
  )
    .lean()
    .cursor();

  let ops: any[] = [];
  let matched = 0;
  let written = 0;
  const flush = async () => {
    if (ops.length === 0) return;
    if (!dryRun) written += (await Prompt.bulkWrite(ops, { ordered: false })).modifiedCount;
    ops = [];
  };

  for await (const prompt of cursor) {
    matched += 1;
    ops.push({
      updateOne: {
        // Re-check in the filter so a concurrent edit can't be overwritten.
        filter: { _id: prompt._id, 'versions.0': { $exists: false } },
        update: {
          $set: {
            currentVersion: 1,
            versions: [
              {
                versionNumber: 1,
                promptText: prompt.promptText,
                templateVariables: extractTemplateVariables(prompt.promptText ?? ''),
                changeSummary: 'Initial version',
                createdBy: prompt.user,
                createdAt: prompt.createdAt ?? new Date(),
              },
            ],
          },
        },
      },
    });
    if (ops.length >= BATCH_SIZE) await flush();
  }
  await flush();

  logger.info(
    `[Migration]: ${matched} prompt(s) without version history; ${dryRun ? 'dry run, nothing written' : `${written} updated`}`,
  );
  return { matched, written };
};

if (process.argv[1]?.includes('add-prompt-versions.migration')) {
  try {
    await mongoose.connect(config.mongo.uriTemplate.replace('<PASSWORD>', config.mongo.password));
    logger.info(`[Migration]: MongoDB connected${dryRun ? ' (dry run)' : ''}`);
    await migratePromptVersions();
    logger.info('[Migration]: ✅ Done');
  } catch (err) {
    logger.error(err, '[Migration]: ❌ Failed');
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
