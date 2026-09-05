import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { COOKIE } from '@/lib/auth/cookies';
import { expiryMs, isExpired } from '@/lib/auth/jwt';
import type { SessionPayload, SessionUser } from '@/types/wire/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/auth/session` — hands the browser its access token.
 *
 * Two jobs:
 *  1. Bootstrap after a hard reload. The token lives in a module-level JS
 *     variable (never localStorage), so a refresh of the page loses it and
 *     the axios client re-reads it from here.
 *  2. The double-checked read inside the cross-tab refresh lock. A tab that
 *     acquires the lock calls this first; if the token it sees differs from
 *     the stale one it set out to replace, another tab already rotated and
 *     it must NOT consume the refresh token again.
 *
 * Never cached — `no-store` is the whole point.
 */
export async function GET() {
  const store = await cookies();
  const token = store.get(COOKIE.access)?.value;
  const sessionRaw = store.get(COOKIE.session)?.value;

  if (!token || !sessionRaw || isExpired(token)) {
    return NextResponse.json(
      { success: false, message: 'No active session.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let user: SessionUser;
  try {
    user = JSON.parse(sessionRaw) as SessionUser;
  } catch {
    return NextResponse.json(
      { success: false, message: 'Malformed session.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const payload: SessionPayload = {
    user,
    token,
    expiresAt: expiryMs(token),
  };
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
