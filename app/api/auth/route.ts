import { NextResponse } from 'next/server';
import { z } from 'zod';

import { AUTH_COOKIE, authCookieOptions, issueCookieValue, verifyPassphrase } from '@/lib/auth';

const bodySchema = z.object({
  passphrase: z.string().min(1),
});

export async function POST(request: Request): Promise<NextResponse> {
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
    // Deliberately identical to any other failure: no hint about which part was wrong.
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, issueCookieValue(), authCookieOptions);
  return response;
}

/** Signs out by clearing the cookie. */
export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, '', { ...authCookieOptions, maxAge: 0 });
  return response;
}
