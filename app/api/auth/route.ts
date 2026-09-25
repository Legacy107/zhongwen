import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  AUTH_COOKIE,
  authCookieOptions,
  authRequired,
  clearedCookieOptions,
  issueCookieValue,
  verifyCookieValue,
  verifyPassphrase,
} from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  passphrase: z.string().min(1),
  remember: z.boolean().default(true),
});

/**
 * Failed attempts per client, to make guessing slow. In memory, so it resets on
 * a cold start and is per-instance on Vercel: a brake, not a wall. The
 * passphrase's own strength is the real defence.
 */
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;
const failures = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

function retryAfterSeconds(key: string, now = Date.now()): number | null {
  const entry = failures.get(key);
  if (!entry || entry.resetAt <= now) return null;
  return entry.count >= MAX_FAILURES ? Math.ceil((entry.resetAt - now) / 1000) : null;
}

function recordFailure(key: string, now = Date.now()): void {
  const entry = failures.get(key);
  if (!entry || entry.resetAt <= now) failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count += 1;
}

/** GET /api/auth -- whether sync needs a sign-in, and whether this browser has one. */
export async function GET(): Promise<NextResponse> {
  const required = authRequired();
  const store = await cookies();
  const signedIn = required && verifyCookieValue(store.get(AUTH_COOKIE)?.value);
  return NextResponse.json({ required, signedIn });
}

export async function POST(request: Request): Promise<NextResponse> {
  const key = clientKey(request);
  const retryAfter = retryAfterSeconds(key);
  if (retryAfter !== null) {
    return NextResponse.json(
      { error: 'too many attempts', retryAfter },
      { status: 429, headers: { 'retry-after': String(retryAfter) } },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  if (!verifyPassphrase(parsed.data.passphrase)) {
    recordFailure(key);
    // Deliberately identical to any other failure: no hint about which part was wrong.
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  failures.delete(key);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, issueCookieValue(), authCookieOptions(parsed.data.remember));
  return response;
}

/** Signs out by clearing the cookie. */
export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, '', clearedCookieOptions);
  return response;
}
