import { describe, expect, it, vi } from 'vitest';

import { ApiClient } from '../src/client.js';
import { RiseonlyError } from '../src/errors.js';
import { RiseonlyBot } from '../src/bot.js';
import { CANONICAL_API_PREFIX, DEFAULT_API_BASE } from '../src/constants.js';
import type { ApiEnvelope, Capabilities, Update, User } from '../src/types/index.js';

const token = 'ro_test.secret';


function fetchInit(call: [unknown, unknown?]): RequestInit {
  const init = call[1];
  if (!init || typeof init !== 'object') {
    throw new Error('expected fetch init options');
  }
  return init as RequestInit;
}

function headerValue(headers: RequestInit['headers'], name: string): string | undefined {
  if (!headers) {
    return undefined;
  }
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }
  if (Array.isArray(headers)) {
    const entry = headers.find(([key]) => key.toLowerCase() === name.toLowerCase());
    return entry?.[1];
  }
  const record = headers as Record<string, string>;
  const direct = record[name] ?? record[name.toLowerCase()];
  return direct;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ApiClient', () => {
  it('calls canonical bot api endpoints', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe(`${DEFAULT_API_BASE}${CANONICAL_API_PREFIX}/getMe`);
      return jsonResponse({ ok: true, result: { id: 'bot-1', is_bot: true, first_name: 'Bot' } });
    });

    const client = new ApiClient(token, { fetch: fetchMock as typeof fetch });
    const me = await client.getMe();
    expect(me.id).toBe('bot-1');
    expect(fetchMock).toHaveBeenCalledOnce();

    const init = fetchInit(fetchMock.mock.calls[0]!);
    expect(headerValue(init.headers, 'Authorization')).toBe(`Bot ${token}`);
  });

  it('supports compatible endpoint mode', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ ok: true, result: { id: 'bot-1', is_bot: true, first_name: 'Bot' } }),
    );
    const client = new ApiClient(token, {
      fetch: fetchMock as typeof fetch,
      useCompatibleEndpoint: true,
    });
    await client.getMe();
    expect(String(fetchMock.mock.calls[0]![0])).toBe(`${DEFAULT_API_BASE}/bot${token}/getMe`);
  });

  it('throws RiseonlyError on api failures', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ ok: false, error_code: 409, description: 'conflict' }, 409),
    );
    const client = new ApiClient(token, { fetch: fetchMock as typeof fetch });
    await expect(client.getMe()).rejects.toBeInstanceOf(RiseonlyError);
    await expect(client.getMe()).rejects.toMatchObject({ code: 409, message: 'conflict' });
  });

  it('sends idempotency header when requestId is provided', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ ok: true, result: { message_id: '1', chat: { id: 'c1' }, date: 1 } }),
    );
    const client = new ApiClient(token, { fetch: fetchMock as typeof fetch });
    await client.sendMessage({
      chat_id: 'c1',
      text: 'hello',
      requestId: 'req-1',
    });
    const init = fetchInit(fetchMock.mock.calls[0]!);
    expect(headerValue(init.headers, 'x-request-id')).toBe('req-1');
  });

  it('loads capabilities document', async () => {
    const capabilities: Capabilities = {
      platform: 'Riseonly Bot API',
      api_version: 'v1',
      canonical_endpoint: '/api/bot/v1/{method}',
      compatible_endpoint: '/bot{token}/{method}',
      authorization: 'Authorization: Bot <token>',
      idempotency_header: 'x-request-id',
      webhook_secret_header: 'x-riseonly-bot-api-secret-token',
      update_delivery: ['getUpdates', 'webhook'],
      mini_app_production_scheme: 'https',
      methods: ['getMe', 'sendMessage'],
    };
    const fetchMock = vi.fn(async () => jsonResponse(capabilities));
    const client = new ApiClient(token, { fetch: fetchMock as typeof fetch });
    const result = await client.getCapabilities();
    expect(result.methods).toContain('sendMessage');
  });
});

describe('RiseonlyBot', () => {
  it('dispatches message and callback events', async () => {
    const bot = new RiseonlyBot(token, { polling: false });
    const messageHandler = vi.fn();
    const callbackHandler = vi.fn();
    bot.on('message', messageHandler);
    bot.on('callback_query', callbackHandler);

    const update: Update = {
      update_id: 10,
      message: {
        message_id: 'm1',
        date: 1,
        chat: { id: 'c1', type: 'private' },
        text: 'hi',
      },
    };
    await bot.processUpdate(update);
    expect(messageHandler).toHaveBeenCalledOnce();

    const callbackUpdate: Update = {
      update_id: 11,
      callback_query: {
        id: 'cb1',
        from: { id: 'u1', is_bot: false, first_name: 'User' },
        data: 'ok',
      },
    };
    await bot.processUpdate(callbackUpdate);
    expect(callbackHandler).toHaveBeenCalledOnce();
  });

  it('polls updates until stopped', async () => {
    const updates: Update[] = [
      {
        update_id: 1,
        message: {
          message_id: 'm1',
          date: 1,
          chat: { id: 'c1', type: 'private' },
          text: 'hello',
        },
      },
    ];
    const fetchMock = vi.fn(async () =>
      jsonResponse({ ok: true, result: updates } satisfies ApiEnvelope<Update[]>),
    );
    const bot = new RiseonlyBot(token, { fetch: fetchMock as typeof fetch, polling: false });
    const handler = vi.fn();
    bot.on('message', handler);

    await bot.startPolling({ timeout: 0, interval: 10 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await bot.stopPolling();

    expect(handler).toHaveBeenCalled();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
  });
});
