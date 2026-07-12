import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { WEBHOOK_SECRET_HEADER } from '../src/constants.js';
import {
  createWebhookHandler,
  parseWebhookUpdate,
  verifyWebhookSecret,
} from '../src/webhook.js';
import {
  buildInitDataCheckString,
  extractInitDataFromLaunchUrl,
  parseInitData,
  signInitData,
  verifyInitData,
} from '../src/utils.js';

const token = 'ro_test.secret';

function signedInitData(fields: Record<string, string>): string {
  const dataCheckString = buildInitDataCheckString(fields);
  const hash = signInitData(token, dataCheckString);
  const params = new URLSearchParams({ ...fields, hash });
  return params.toString();
}

describe('init data utils', () => {
  it('verifies valid init data', () => {
    const encoded = signedInitData({
      user: JSON.stringify({ id: 'u1', name: 'User' }),
      chat_id: 'c1',
      expires_at: String(Date.now() + 60_000),
    });
    const fields = verifyInitData(token, encoded);
    expect(fields.chat_id).toBe('c1');
    expect(JSON.parse(fields.user!).id).toBe('u1');
  });

  it('rejects tampered init data', () => {
    const encoded = signedInitData({ chat_id: 'c1' });
    expect(() => verifyInitData(token, `${encoded}x`)).toThrow();
  });

  it('extracts init data from launch url hash', () => {
    const encoded = signedInitData({ start_param: 'campaign' });
    const url = `https://example.com/app#riseonlyInitData=${encodeURIComponent(encoded)}`;
    const extracted = extractInitDataFromLaunchUrl(url);
    expect(extracted).toBeTruthy();
    verifyInitData(token, extracted!);
    expect(parseInitData(extracted!).start_param).toBe('campaign');
  });
});

describe('webhook utils', () => {
  it('parses webhook update payloads', () => {
    const update = parseWebhookUpdate({
      update_id: 5,
      message: { message_id: 'm1', date: 1, chat: { id: 'c1', type: 'private' } },
    });
    expect(update.update_id).toBe(5);
    expect(update.message?.message_id).toBe('m1');
  });

  it('verifies webhook secret header', () => {
    expect(verifyWebhookSecret({ [WEBHOOK_SECRET_HEADER]: 'secret' }, 'secret')).toBe(true);
    expect(verifyWebhookSecret({}, 'secret')).toBe(false);
  });

  it('handles webhook requests through adapter', async () => {
    const onUpdate = vi.fn();
    const handler = createWebhookHandler({
      secretToken: 'secret',
      onUpdate,
    });
    const result = await handler({
      headers: { [WEBHOOK_SECRET_HEADER]: 'secret' },
      body: {
        update_id: 1,
        callback_query: {
          id: 'cb1',
          from: { id: 'u1', is_bot: false, first_name: 'User' },
          data: 'ok',
        },
      },
    });
    expect(result.status).toBe(200);
    expect(onUpdate).toHaveBeenCalledOnce();
  });
});
