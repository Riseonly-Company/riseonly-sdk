import { describe, expect, it, vi } from 'vitest';

import {
  isGroupChat,
  parseCommand,
  RiseonlyBot,
  serializeCommandScope,
} from '../src/index.js';
import type { Message, Update } from '../src/index.js';

const token = 'ro_test.secret';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sentBody(call: unknown[]): Record<string, unknown> {
  const init = call[1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

function calledMethod(call: unknown[]): string {
  return String(call[0]).split('/').pop()!;
}

function groupMessage(text: string, extra: Partial<Message> = {}): Update {
  return {
    update_id: 1,
    message: {
      message_id: 'm1',
      date: 1,
      chat: { id: 'g1', type: 'group', title: 'Team' },
      text,
      ...extra,
    },
  };
}

describe('parseCommand', () => {
  it('reads the command, the addressed bot and the arguments', () => {
    expect(parseCommand('/start')).toEqual({ command: 'start', target: undefined, args: '' });
    expect(parseCommand('/Roll@DiceBot 2d6 now')).toEqual({
      command: 'roll',
      target: 'DiceBot',
      args: '2d6 now',
    });
    expect(parseCommand('  /help  ')).toEqual({ command: 'help', target: undefined, args: '' });
    expect(parseCommand('/note line one\nline two')?.args).toBe('line one\nline two');
  });

  it('ignores text that is not a command', () => {
    for (const text of [undefined, '', 'hello /start', '/', '/start@', '/ start', '/st-art']) {
      expect(parseCommand(text)).toBeUndefined();
    }
  });
});

describe('isGroupChat', () => {
  it('treats groups and channels as shared chats in any case', () => {
    expect(isGroupChat({ type: 'group' })).toBe(true);
    expect(isGroupChat({ type: 'GROUP' })).toBe(true);
    expect(isGroupChat({ type: 'channel' })).toBe(true);
    expect(isGroupChat({ type: 'private' })).toBe(false);
    expect(isGroupChat({})).toBe(false);
    expect(isGroupChat(undefined)).toBe(false);
  });
});

describe('serializeCommandScope', () => {
  it('sends a chat scope as the chat key the app resolves', () => {
    expect(serializeCommandScope({ type: 'chat', chat_id: 'g1' })).toBe('chat:g1');
    expect(serializeCommandScope({ type: 'all_group_chats' })).toBe('all_group_chats');
    expect(serializeCommandScope('chat:g2')).toBe('chat:g2');
    expect(serializeCommandScope(undefined)).toBeUndefined();
    expect(() => serializeCommandScope({ type: 'chat', chat_id: ' ' })).toThrow(/chat_id/);
  });
});

describe('group commands', () => {
  it('runs unaddressed and own commands, skips commands for other bots, reads getMe once', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      ok: true,
      result: { id: 'b1', is_bot: true, first_name: 'Dice', username: 'DiceBot' },
    }));
    const bot = new RiseonlyBot(token, { fetch: fetchMock as typeof fetch });
    const seen: string[] = [];
    bot.command('roll', (message) => { seen.push(message.text!); });

    await bot.processUpdate(groupMessage('/roll'));
    expect(fetchMock).not.toHaveBeenCalled();
    await bot.processUpdate(groupMessage('/roll@dicebot 2d6'));
    await bot.processUpdate(groupMessage('/roll@OtherBot'));
    await bot.processUpdate(groupMessage('/roll@DiceBot'));

    expect(seen).toEqual(['/roll', '/roll@dicebot 2d6', '/roll@DiceBot']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calledMethod(fetchMock.mock.calls[0]!)).toBe('getMe');
  });

  it('uses the configured username without calling getMe', async () => {
    const fetchMock = vi.fn();
    const bot = new RiseonlyBot(token, { fetch: fetchMock as typeof fetch, username: '@DiceBot' });
    const handler = vi.fn();
    bot.command('/roll', handler);

    await bot.processUpdate(groupMessage('/roll@dicebot'));
    await bot.processUpdate(groupMessage('/roll@other'));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries getMe after a failed read', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValue(jsonResponse({
        ok: true,
        result: { id: 'b1', is_bot: true, first_name: 'Dice', username: 'DiceBot' },
      }));
    const bot = new RiseonlyBot(token, { fetch: fetchMock as typeof fetch });

    await expect(bot.getBotInfo()).rejects.toThrow();
    await expect(bot.getBotInfo()).resolves.toMatchObject({ username: 'DiceBot' });
    await bot.getBotInfo();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('replies in the topic of the message', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      ok: true,
      result: { message_id: 'm2', date: 2, chat: { id: 'g1' } },
    }));
    const bot = new RiseonlyBot(token, { fetch: fetchMock as typeof fetch });
    const update = groupMessage('/roll', { message_thread_id: 't7' });

    await bot.reply(update.message!, 'rolled 4');
    await bot.reply({ ...update.message!, message_thread_id: undefined }, 'plain');

    expect(sentBody(fetchMock.mock.calls[0]!)).toEqual({
      chat_id: 'g1',
      text: 'rolled 4',
      reply_to_message_id: 'm1',
      message_thread_id: 't7',
    });
    expect(sentBody(fetchMock.mock.calls[1]!)).not.toHaveProperty('message_thread_id');
  });
});

describe('membership updates', () => {
  it('emits my_chat_member when the bot is added to a group', async () => {
    const bot = new RiseonlyBot(token, { fetch: vi.fn() as typeof fetch });
    const added = vi.fn();
    const members = vi.fn();
    bot.on('my_chat_member', added);
    bot.on('chat_member', members);
    const update: Update = {
      update_id: 5,
      my_chat_member: {
        chat: { id: 'g1', type: 'group', title: 'Team', member_count: 3 },
        from: { id: 'u1', is_bot: false, first_name: 'Ann' },
        date: 10,
        old_chat_member: { user: { id: 'b1', is_bot: true, first_name: 'Dice' }, status: 'left' },
        new_chat_member: { user: { id: 'b1', is_bot: true, first_name: 'Dice' }, status: 'member' },
      },
    };

    await bot.processUpdate(update);

    expect(added).toHaveBeenCalledWith(update.my_chat_member, update);
    expect(members).not.toHaveBeenCalled();
  });
});

describe('group command menus', () => {
  it('sets private and group lists from setup and skips lists that already match', async () => {
    const stored: Record<string, unknown> = {
      'all_group_chats\n': [{ command: 'roll', description: 'Roll dice' }],
    };
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const method = String(url).split('/').pop();
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      const key = `${String(body.scope ?? 'default')}\n${String(body.language_code ?? '')}`;
      if (method === 'getMyCommands') {
        return jsonResponse({ ok: true, result: stored[key] ?? [] });
      }
      stored[key] = body.commands;
      return jsonResponse({ ok: true, result: true });
    });
    const bot = new RiseonlyBot(token, { fetch: fetchMock as typeof fetch });

    await bot.setup({
      commands: [{ command: 'start', description: 'Start' }],
      commandScope: { type: 'all_private_chats' },
      commandSets: [
        { scope: { type: 'all_group_chats' }, commands: [{ command: 'roll', description: 'Roll dice' }] },
        { scope: { type: 'chat', chat_id: 'g1' }, languageCode: 'ru', commands: [
          { command: 'roll', description: 'Бросить кубики' },
        ] },
      ],
    });

    const writes = fetchMock.mock.calls
      .filter((call) => calledMethod(call) === 'setMyCommands')
      .map((call) => sentBody(call));
    expect(writes).toEqual([
      { commands: [{ command: 'start', description: 'Start' }], scope: 'all_private_chats' },
      {
        commands: [{ command: 'roll', description: 'Бросить кубики' }],
        scope: 'chat:g1',
        language_code: 'ru',
      },
    ]);
  });

  it('refuses two lists for the same scope and language', async () => {
    const fetchMock = vi.fn();
    const bot = new RiseonlyBot(token, { fetch: fetchMock as typeof fetch });

    await expect(bot.setup({
      name: 'Dice',
      commands: [{ command: 'start', description: 'Start' }],
      commandSets: [{ scope: 'default', commands: [{ command: 'help', description: 'Help' }] }],
    })).rejects.toThrow(/two command lists/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serializes object scopes for get and delete', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, result: [] }));
    const bot = new RiseonlyBot(token, { fetch: fetchMock as typeof fetch });

    await bot.getMyCommands({ scope: { type: 'chat', chat_id: 'g1' } });
    await bot.deleteMyCommands({ scope: { type: 'all_group_chats' }, language_code: 'en' });

    expect(sentBody(fetchMock.mock.calls[0]!)).toEqual({ scope: 'chat:g1' });
    expect(sentBody(fetchMock.mock.calls[1]!)).toEqual({ scope: 'all_group_chats', language_code: 'en' });
  });

  it('passes the topic to media sends', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      ok: true,
      result: { message_id: 'm3', date: 3, chat: { id: 'g1' } },
    }));
    const bot = new RiseonlyBot(token, { fetch: fetchMock as typeof fetch });

    await bot.sendPhoto('https://cdn.example.com/a.jpg', { chat_id: 'g1', message_thread_id: 't7' });

    expect(sentBody(fetchMock.mock.calls[0]!)).toMatchObject({ chat_id: 'g1', message_thread_id: 't7' });
  });
});
