/**
 * Server-side product analytics (PostHog). Only events the browser can't
 * report reliably, such as completed payments from the billing webhook.
 * Properties must never contain prompt text, emails or other personal data;
 * the distinct ID is the user's database ID, matching the frontend.
 */
import { PostHog } from 'posthog-node';
import config from '../config/env.config.js';
import logger from '../config/logger.config.js';

type Props = Record<string, string | number | boolean | null>;

let client: PostHog | null = null;

const getClient = () => {
  if (!config.posthog.apiKey) return null;
  // Low volume: send each event right away instead of batching.
  client ??= new PostHog(config.posthog.apiKey, { host: config.posthog.host, flushAt: 1, flushInterval: 0 });
  return client;
};

export const captureServerEvent = (distinctId: string, event: string, properties: Props = {}) => {
  try {
    getClient()?.capture({ distinctId, event, properties: { ...properties, source: 'server' } });
  } catch (error) {
    logger.warn(error, `[Analytics]: failed to capture ${event}`);
  }
};

/** Flush queued events before the process exits. */
export const shutdownProductAnalytics = async () => {
  if (!client) return;
  try {
    await client.shutdown();
  } catch (error) {
    logger.warn(error, '[Analytics]: shutdown failed');
  }
};
