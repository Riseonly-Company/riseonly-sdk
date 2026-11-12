import { describe, expect, it } from 'vitest';
import { getStartPayload, RiseonlyBot } from '../src/index.js';

describe('bot start payloads', () => {
  it('extracts a payload without changing its case', () => {
    expect(getStartPayload({ text: '/start 4jzK82pQxsM' })).toBe('4jzK82pQxsM');
    expect(getStartPayload({ text: '/start@anonbot Ab_9-z' })).toBe('Ab_9-z');
    expect(getStartPayload({ text: `/start ${'a'.repeat(64)}` })).toBe('a'.repeat(64));
  });

  it('does not confuse arbitrary messages with link parameters', () => {
    for (const text of [undefined, '/start', '/other token', '/start a b', '/start a/b',
      '/start a&b', '/start тест', `/start ${'a'.repeat(65)}`, '/start\npayload']) {
      expect(getStartPayload({ text })).toBeUndefined();
    }
  });

  it('works inside existing command handlers', async () => {
    const bot = new RiseonlyBot('test.secret');
    let payload: string | undefined;
    bot.command('start', (message) => { payload = getStartPayload(message); });
    await bot.processUpdate({ update_id: 1, message: {
      message_id: 'm1', date: 1, chat: { id: 'c1', type: 'private' },
      text: '/start 4jzK82pQxsM',
    } });
    expect(payload).toBe('4jzK82pQxsM');
  });
});
