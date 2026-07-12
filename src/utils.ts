import { createHmac, timingSafeEqual } from 'node:crypto';

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
