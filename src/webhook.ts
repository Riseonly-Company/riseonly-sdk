import { timingSafeEqual } from 'node:crypto';

import { WEBHOOK_SECRET_HEADER } from './constants.js';
import type { Update } from './types/index.js';

export interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

/**
 * Parses a webhook request body into an Update object.
 */
export function parseWebhookUpdate(body: unknown): Update {
  if (!body || typeof body !== 'object') {
    throw new Error('webhook body must be an object');
  }
  const update = body as Update;
  if (typeof update.update_id !== 'number') {
    throw new Error('webhook body is missing update_id');
  }
  return update;
}

/**
 * Verifies the webhook secret header sent by Riseonly.
 */
export function verifyWebhookSecret(
  headers: Record<string, string | string[] | undefined>,
  secretToken?: string,
): boolean {
  if (!secretToken) {
    return true;
  }
  const headerEntry = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === WEBHOOK_SECRET_HEADER,
  );
  const headerValue = headerEntry?.[1];
  if (!headerValue) {
    return false;
  }
  const received = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof received !== 'string') {
    return false;
  }
  const actual = Buffer.from(received);
  const expected = Buffer.from(secretToken);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Creates a minimal request handler for frameworks like Express or Fastify.
 */
export function createWebhookHandler(options: {
  secretToken?: string;
  onUpdate: (update: Update) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
}) {
  return async (request: WebhookRequest): Promise<{ status: number; body?: unknown }> => {
    if (!verifyWebhookSecret(request.headers, options.secretToken)) {
      return { status: 401, body: { ok: false, description: 'invalid webhook secret' } };
    }

    let update: Update;
    try {
      update = parseWebhookUpdate(request.body);
    } catch (error) {
      await notifyWebhookError(options.onError, error);
      return { status: 400, body: { ok: false, description: 'invalid webhook payload' } };
    }

    try {
      await options.onUpdate(update);
      return { status: 200, body: { ok: true } };
    } catch (error) {
      await notifyWebhookError(options.onError, error);
      return { status: 500, body: { ok: false, description: 'webhook handler failed' } };
    }
  };
}

async function notifyWebhookError(
  handler: ((error: unknown) => void | Promise<void>) | undefined,
  error: unknown,
): Promise<void> {
  try {
    await handler?.(error);
  } catch {
    return;
  }
}
