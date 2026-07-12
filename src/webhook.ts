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
  const headerValue = headers[WEBHOOK_SECRET_HEADER] ?? headers[WEBHOOK_SECRET_HEADER.toLowerCase()];
  if (!headerValue) {
    return false;
  }
  const received = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return received === secretToken;
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
    try {
      if (!verifyWebhookSecret(request.headers, options.secretToken)) {
        return { status: 401, body: { ok: false, description: 'invalid webhook secret' } };
      }
      const update = parseWebhookUpdate(request.body);
      await options.onUpdate(update);
      return { status: 200, body: { ok: true } };
    } catch (error) {
      await options.onError?.(error);
      return { status: 400, body: { ok: false, description: 'invalid webhook payload' } };
    }
  };
}
