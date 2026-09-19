import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Single shared identity: this is a one-user app, so "auth" is a passphrase
 * that mints a signed cookie. The cookie carries an issue timestamp and an
 * HMAC over it, so it can be validated without any server-side session store.
 */

export const AUTH_COOKIE = 'chinese_auth';

/** Long expiry -- re-entering a passphrase on a phone mid-review is miserable. */
export const AUTH_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function requireEnv(name: 'APP_PASSPHRASE' | 'AUTH_SECRET'): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/**
 * Compares in constant time. `timingSafeEqual` throws on a length mismatch,
 * which would itself leak the length, so both sides are hashed to a fixed size
 * first and the digests compared.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const secret = requireEnv('AUTH_SECRET');
  const digestA = createHmac('sha256', secret).update(a).digest();
  const digestB = createHmac('sha256', secret).update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

export function verifyPassphrase(candidate: string): boolean {
  return constantTimeEquals(candidate, requireEnv('APP_PASSPHRASE'));
}

function sign(payload: string): string {
  return createHmac('sha256', requireEnv('AUTH_SECRET')).update(payload).digest('base64url');
}

/** Cookie value is `<issuedAtMs>.<hmac>`. */
export function issueCookieValue(now = new Date()): string {
  const issuedAt = String(now.getTime());
  return `${issuedAt}.${sign(issuedAt)}`;
}

export function verifyCookieValue(value: string | undefined, now = new Date()): boolean {
  if (!value) return false;

  const separator = value.lastIndexOf('.');
  if (separator <= 0) return false;

  const issuedAt = value.slice(0, separator);
  const signature = value.slice(separator + 1);

  const expected = sign(issuedAt);
  if (signature.length !== expected.length) return false;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;

  const issuedAtMs = Number(issuedAt);
  if (!Number.isFinite(issuedAtMs)) return false;

  const ageSeconds = (now.getTime() - issuedAtMs) / 1000;
  return ageSeconds >= 0 && ageSeconds < AUTH_MAX_AGE_SECONDS;
}

export const authCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: AUTH_MAX_AGE_SECONDS,
} as const;
