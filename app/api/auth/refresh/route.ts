import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';

import {
  COOKIE,
  clearSessionCookies,
  setSessionCookies,
  toSessionUser,
} from '@/lib/auth/cookies';
import { AuthUpstreamError, refresh } from '@/lib/auth/upstream';
import { forbiddenOrigin, isSameOrigin } from '@/lib/auth/origin-check';
import { expiryMs } from '@/lib/auth/jwt';
import type { RefreshResponseWire, SessionUser } from '@/types/wire/auth';

export const runtime = 'nodejs';

/**
 * Server-side idempotency for concurrent rotations.
 *
 * `rotateRefreshToken` on the backend is a non-atomic read-modify-write
 * (findOne → create successor → save revocation). Two genuinely simultaneous
 * refreshes carrying the same raw token can BOTH succeed and mint two
 * independent chains; whichever one loses gets replayed later, trips reuse
 * detection, and `revokeAllForAccount` signs the user out of every device.
 *
 * This map collapses same-token requests arriving inside a short window onto
 * one upstream call.
 *
 * HONEST LIMITATION: it is per-process. On a single long-lived `next start`
 * container it works. On multi-instance serverless it is best-effort only —
 * the layer actually relied upon is the browser-side Web Lock in
 * lib/auth/refresh.ts, which prevents the concurrency from ever arriving.
 * If you deploy serverless and want a hard guarantee, back this with Redis.
 */
const inFlight = new Map<string, Promise<RefreshResponseWire>>();
const IN_FLIGHT_TTL_MS = 30_000;

function dedupe(rawToken: string): Promise<RefreshResponseWire> {
  const key = createHash('sha256').update(rawToken).digest('hex');
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = refresh(rawToken);
  inFlight.set(key, promise);
  const drop = () => inFlight.delete(key);
  promise.then(drop, drop);
  setTimeout(drop, IN_FLIGHT_TTL_MS).unref?.();
  return promise;
}

/**
 * `POST /api/auth/refresh` — rotate the token pair and re-mint the cookies.
 *
 * A failure here is terminal: a 401 from the backend means either a genuinely
 * expired token or a reuse-detection nuke, and both mean this browser's
 * session is over. Clear everything and let the client bounce to /login.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return forbiddenOrigin();

  const cookieStore = request.headers.get('cookie') ?? '';
  const match = cookieStore.match(new RegExp(`${COOKIE.refresh}=([^;]+)`));
  const refreshToken = match?.[1];

  const sessionRaw = cookieStore.match(
    new RegExp(`${COOKIE.session}=([^;]+)`),
  )?.[1];

  if (!refreshToken) {
    const res = NextResponse.json(
      { success: false, message: 'Session expired. Please sign in again.' },
      { status: 401 },
    );
    clearSessionCookies(res.cookies);
    return res;
  }

  let user: SessionUser | null = null;
  try {
    user = sessionRaw
      ? (JSON.parse(decodeURIComponent(sessionRaw)) as SessionUser)
      : null;
  } catch {
    user = null;
  }

  try {
    const rotated = await dedupe(decodeURIComponent(refreshToken));

    // Prefer the identity the backend just re-read from the database over the
    // one in the cookie. The cookie's copy was stamped at sign-in and is only
    // ever carried forward, so a role or permission changed since then would
    // never reach this console: the operator keeps the UI of the role they had
    // when they logged in, while the API — which resolves permissions from the
    // account row on every request — happily accepts actions the buttons are
    // busy telling them they cannot take.
    //
    // Falls back to the cookie when the backend predates the `user` field, so
    // a console deployed ahead of the API keeps refreshing instead of logging
    // everyone out.
    const nextUser: SessionUser | null = rotated.user
      ? toSessionUser(rotated.user)
      : user;

    if (!nextUser) {
      const res = NextResponse.json(
        { success: false, message: 'Session expired. Please sign in again.' },
        { status: 401 },
      );
      clearSessionCookies(res.cookies);
      return res;
    }

    const res = NextResponse.json({
      user: nextUser,
      token: rotated.token,
      expiresAt: expiryMs(rotated.token),
    });
    setSessionCookies(res.cookies, {
      token: rotated.token,
      refreshToken: rotated.refreshToken,
      user: nextUser,
    });
    return res;
  } catch (err) {
    const status = err instanceof AuthUpstreamError ? err.status : 401;
    const message =
      err instanceof AuthUpstreamError
        ? err.message
        : 'Session expired. Please sign in again.';
    const res = NextResponse.json(
      { success: false, message, error_code: 'invalid_refresh_token' },
      { status: status === 503 ? 503 : 401 },
    );
    // Do not clear on an unreachable backend — that would sign everyone out
    // during a brief API blip. Only a real rejection ends the session.
    if (status !== 503) clearSessionCookies(res.cookies);
    return res;
  }
}
