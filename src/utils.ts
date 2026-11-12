import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Message } from './types/index.js';

/**
 * Reads an opaque parameter from `/start <payload>` (including addressed commands).
 * Returns undefined for a plain start or malformed payload. This is user input,
 * not proof of a link visit or authorization; resolve it against your own records.
 */
export function getStartPayload(message: Pick<Message, 'text'>): string | undefined {
  return /^\/start(?:@[A-Za-z0-9_]+)?[ \t]+([A-Za-z0-9_-]{1,64})$/.exec(
    message.text?.trim() ?? '',
  )?.[1];
}

import type {
  Chat,
  CommandScopeInput,
  ParsedCommand,
} from './types/index.js';

const COMMAND_RE = /^\/([A-Za-z0-9_]+)(?:@([A-Za-z0-9_]+))?(?:\s+([\s\S]*))?$/;
const GROUP_CHAT_TYPES = new Set(['group', 'supergroup', 'channel']);

/**
 * Parses `/command`, `/command args` and the group form `/command@bot args`.
 * Returns undefined when the text does not start with a command token.
 */
export function parseCommand(text: string | undefined): ParsedCommand | undefined {
  const match = COMMAND_RE.exec(text?.trim() ?? '');
  if (!match) {
    return undefined;
  }
  return {
    command: match[1]!.toLowerCase(),
    target: match[2],
    args: match[3]?.trim() ?? '',
  };
}

/** True for group and channel chats, where several bots and people share one chat. */
export function isGroupChat(chat: Pick<Chat, 'type'> | undefined): boolean {
  return GROUP_CHAT_TYPES.has(chat?.type?.toLowerCase() ?? '');
}

/**
 * Converts a command scope to its wire spelling. The object form
 * `{ type: 'chat', chat_id }` becomes `chat:<chat_id>`, the key the app resolves.
 */
export function serializeCommandScope(scope: CommandScopeInput | undefined): string | undefined {
  if (scope === undefined) {
    return undefined;
  }
  if (typeof scope === 'string') {
    return scope;
  }
  if (scope.type === 'chat') {
    const chatId = scope.chat_id?.trim();
    if (!chatId) {
      throw new Error('chat_id is required for a chat command scope');
    }
    return `chat:${chatId}`;
  }
  return scope.type;
}

export interface InitDataFields {
  [key: string]: string;
}

const INIT_DATA_HASH_RE = /^[0-9a-f]{64}$/;

/**
 * Parses URL-encoded init data into key/value fields.
 */
export function parseInitData(encoded: string): InitDataFields {
  const fields = Object.fromEntries(new URLSearchParams(encoded).entries());
  return fields;
}

/**
 * Builds the data check string used for init data signature verification.
 */
export function buildInitDataCheckString(fields: InitDataFields): string {
  return Object.entries(fields)
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

/**
 * Derives the HMAC secret from a bot token.
 */
export function deriveInitDataSecret(botToken: string): Buffer {
  return createHmac('sha256', 'WebAppData').update(botToken).digest();
}

/**
 * Computes the expected init data hash for a bot token.
 */
export function signInitData(botToken: string, dataCheckString: string): string {
  const secret = deriveInitDataSecret(botToken);
  return createHmac('sha256', secret).update(dataCheckString).digest('hex');
}

/**
 * Verifies signed mini app init data.
 */
export function verifyInitData(botToken: string, encoded: string): InitDataFields {
  const fields = parseInitData(encoded);
  const hash = fields.hash;
  if (!hash) {
    throw new Error('init data hash is missing');
  }
  if (!INIT_DATA_HASH_RE.test(hash)) {
    throw new Error('init data signature is invalid');
  }

  const dataCheckString = buildInitDataCheckString(fields);
  const expected = signInitData(botToken, dataCheckString);

  const left = Buffer.from(hash, 'hex');
  const right = Buffer.from(expected, 'hex');
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error('init data signature is invalid');
  }

  const authDate = Number(fields.auth_date);
  const expiresAt = Number(fields.expires_at);
  if (!Number.isSafeInteger(authDate) || !Number.isSafeInteger(expiresAt) || expiresAt <= authDate) {
    throw new Error('init data timestamps are invalid');
  }
  if (expiresAt < Date.now()) {
    throw new Error('init data has expired');
  }

  return fields;
}

/**
 * Extracts init data from a launch URL hash fragment.
 */
export function extractInitDataFromLaunchUrl(launchUrl: string): string | null {
  const url = new URL(launchUrl);
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  if (!hash) {
    return null;
  }
  return new URLSearchParams(hash).get('riseonlyInitData');
}

/**
 * Creates a random idempotency key for Bot API requests.
 */
export function createRequestId(): string {
  return crypto.randomUUID();
}
