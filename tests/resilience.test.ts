import { describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:net';

import { RiseonlyBot } from '../src/bot.js';
import { ApiClient } from '../src/client.js';
import {
  RiseonlyAbortError,
  RiseonlyResponseError,
  RiseonlyTimeoutError,
} from '../src/errors.js';
import type { Update } from '../src/types/index.js';

const token = 'ro_test.secret';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function pendingFetch(): typeof fetch {
  return vi.fn(async (_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'));
      }, { once: true });
    })) as typeof fetch;
}

describe('network resilience', () => {
  it('wraps non-JSON gateway responses', async () => {
    const client = new ApiClient(token, {
      fetch: vi.fn(async () => new Response('<html>bad gateway</html>', { status: 502 })) as typeof fetch,
    });
    await expect(client.getMe()).rejects.toMatchObject({
      name: 'RiseonlyResponseError',
      status: 502,
    } satisfies Partial<RiseonlyResponseError>);
  });

  it('distinguishes caller cancellation from timeout', async () => {
    const controller = new AbortController();
    const client = new ApiClient(token, { fetch: pendingFetch(), requestTimeoutMs: 5_000 });
    const request = client.getMe({ signal: controller.signal });
    controller.abort();
    await expect(request).rejects.toBeInstanceOf(RiseonlyAbortError);

    const timedClient = new ApiClient(token, { fetch: pendingFetch(), requestTimeoutMs: 5 });
    await expect(timedClient.getMe()).rejects.toBeInstanceOf(RiseonlyTimeoutError);
  });
});

describe('developer helpers', () => {
  it('dispatches command, hears, and action handlers', async () => {
    const bot = new RiseonlyBot(token);
    const command = vi.fn();
    const hears = vi.fn();
    const action = vi.fn();
    bot.command('start', command);
    bot.hears(/music/i, hears);
    bot.action(/^track:/, action);

    await bot.processUpdate(messageUpdate(1, '/start payload'));
    await bot.processUpdate(messageUpdate(2, 'find music'));
    await bot.processUpdate({
      update_id: 3,
      callback_query: {
        id: 'cb-1',
        from: { id: 'user-1', is_bot: false, first_name: 'User' },
        data: 'track:1',
      },
    });

    expect(command).toHaveBeenCalledOnce();
    expect(hears).toHaveBeenCalledOnce();
    expect(action).toHaveBeenCalledOnce();
  });

  it('does not recurse when an error listener throws', async () => {
    const bot = new RiseonlyBot(token);
    const errorListener = vi.fn(async () => {
      throw new Error('error listener failed');
    });
    bot.on('message', async () => {
      throw new Error('message failed');
    });
    bot.on('error', errorListener);

    await expect(bot.processUpdate(messageUpdate(1, 'hello'))).rejects.toThrow('message failed');
    expect(errorListener).toHaveBeenCalledOnce();
  });

  it('keeps declarative setup idempotent when configuration already matches', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const method = String(url).split('/').at(-1);
      const result = {
        getMyName: { name: 'Music Bot' },
        getMyDescription: { description: 'Search mock tracks' },
        getMe: {
          id: 'bot-1',
          is_bot: true,
          first_name: 'Music Bot',
          avatar_url: 'https://example.com/avatar.png',
        },
        getMyCommands: [{ command: 'start', description: 'Start the bot' }],
        getWebhookInfo: { url: '', enabled: false },
      }[method ?? ''];
      return jsonResponse({ ok: true, result });
    });
    const bot = new RiseonlyBot(token, { fetch: fetchMock as typeof fetch });
    await bot.setup({
      name: 'Music Bot',
      description: 'Search mock tracks',
      profilePhoto: { url: 'https://example.com/avatar.png' },
      commands: [{ command: 'start', description: 'Start the bot' }],
      webhook: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    const methods = fetchMock.mock.calls.map(([url]) => String(url).split('/').at(-1));
    expect(methods).toEqual([
      'getMyName',
      'getMyDescription',
      'getMe',
      'getMyCommands',
      'getWebhookInfo',
    ]);
  });

  it('preserves media metadata in Bot API requests', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      ok: true,
      result: { message_id: 'm1', date: 1, chat: { id: 'c1' } },
    }));
    const bot = new RiseonlyBot(token, { fetch: fetchMock as typeof fetch });
    await bot.sendAudio({
      url: 'https://example.com/song.mp3',
      file_name: 'Song.mp3',
      mime_type: 'audio/mpeg',
      duration: 1,
      thumbnail_url: 'https://example.com/cover.png',
    }, { chat_id: 'c1', caption: 'Artist — Song' });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(payload.audio).toMatchObject({
      file_name: 'Song.mp3',
      mime_type: 'audio/mpeg',
      duration: 1,
    });
  });

  it('passes an optional custom chat action status', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, result: true }));
    const bot = new RiseonlyBot(token, { fetch: fetchMock as typeof fetch });
    await bot.sendChatAction({
      chat_id: 'c1',
      action: 'upload_document',
      status_text: 'собирает MP3…',
    });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      chat_id: 'c1',
      action: 'upload_document',
      status_text: 'собирает MP3…',
    });
  });

  it('uploads reusable media through the public Bot API', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      ok: true,
      result: {
        file_id: 'botmedia_018f82d5-cd83-7db4-9a8e-c5887461f347',
        file_url: 'https://cdn.riseonly.net/public/inline/aa/file.mp3',
        media_type: 'audio',
        mime_type: 'audio/mpeg',
        file_size: 123,
      },
    }));
    const bot = new RiseonlyBot(token, { fetch: fetchMock as typeof fetch });
    const stored = await bot.uploadMedia({
      media_type: 'audio',
      url: 'https://example.com/song.mp3',
      requestId: 'upload-song-1',
    });
    expect(stored.media_type).toBe('audio');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/uploadMedia$/);
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      media_type: 'audio',
      url: 'https://example.com/song.mp3',
    });
    expect(new Headers((init as RequestInit).headers).get('x-request-id')).toBe('upload-song-1');
  });

  it('runs a bounded built-in webhook server', async () => {
    const port = await reservePort();
    const bot = new RiseonlyBot(token);
    const messageHandler = vi.fn();
    bot.on('message', messageHandler);
    await bot.startWebhook({
      host: '127.0.0.1',
      port,
      path: '/hook',
      secretToken: 'secret',
      maxBodyBytes: 512,
    });

    const response = await fetch(`http://127.0.0.1:${port}/hook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-riseonly-bot-api-secret-token': 'secret',
      },
      body: JSON.stringify(messageUpdate(7, 'hello')),
    });
    expect(response.status).toBe(200);
    expect(messageHandler).toHaveBeenCalledOnce();

    const oversized = await fetch(`http://127.0.0.1:${port}/hook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-riseonly-bot-api-secret-token': 'secret',
      },
      body: JSON.stringify({ update_id: 8, data: 'x'.repeat(1_024) }),
    });
    expect(oversized.status).toBe(413);
    await bot.stop();
  });
});

function messageUpdate(updateId: number, text: string): Update {
  return {
    update_id: updateId,
    message: {
      message_id: `m-${updateId}`,
      date: Date.now(),
      chat: { id: 'chat-1', type: 'private' },
      text,
    },
  };
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('unable to reserve test port');
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return address.port;
}
