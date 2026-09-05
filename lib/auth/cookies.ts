import 'server-only';

import type { ResponseCookies } from 'next/dist/compiled/@edge-runtime/cookies';

import { IS_PROD } from '@/lib/config/env';
import { expiryMs } from './jwt';
import { COOKIE } from './cookie-names';
import type { AccountWire, SessionUser } from '@/types/wire/auth';

export { COOKIE };

/**
 * The three cookies the BFF mints. All httpOnly — nothing here is readable
 * from JavaScript.
 *
 * - `taafi_at`  raw access JWT; read by middleware at the edge and by
 *   `/api/auth/session`. Expires with the JWT.
 * - `taafi_rt`  raw refresh token, scoped to `path=/api/auth` so this 30-day
 *   credential is attached to exactly two destinations (refresh and logout)
 *   and never rides along with a page navigation.
 * - `taafi_session`  compact identity for the dashboard layout's first paint.
 *
 * Note what is NOT here: none of these ever reach Express. The API lives on a
 * different origin and has no cookie handling at all (no cookie-parser, no
 * Set-Cookie anywhere in the backend). Every API call authenticates with a
 * bearer header instead. That means this portal has no CSRF surface on the
 * API — only on its own three POST handlers, which are covered by SameSite
 * plus an Origin check.
 */

const REFRESH_MAX_AGE_S = 30 * 24 * 60 * 60; // matches REFRESH_TTL_DAYS default

const base = {
  httpOnly: true,
  secure: IS_PROD,
  path: '/',
} as const;

/** Trim `Account.toJSON()` down to what the UI actually renders. */
export function toSessionUser(account: AccountWire): SessionUser {
  return {
    id: account.id,
    full_name: account.full_name ?? '',
    email: account.email ?? '',
    role: account.role,
    permissions: account.permissions ?? [],
  };
}

/**
 * Write all three cookies onto a response.
 *
 * The access and session cookies expire with the JWT itself, so a stale
 * identity can never outlive the credential it describes.
 */
export function setSessionCookies(
  cookies: ResponseCookies,
  opts: { token: string; refreshToken: string; user: SessionUser },
): void {
  const exp = expiryMs(opts.token);
  const expires = exp ? new Date(exp) : undefined;

  cookies.set(COOKIE.access, opts.token, {
    ...base,
    sameSite: 'lax',
    expires,
  });

  cookies.set(COOKIE.refresh, opts.refreshToken, {
    ...base,
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: REFRESH_MAX_AGE_S,
  });

  // Keep this small. Cookie headers hit a hard 4 KB wall, and it is a cliff
  // rather than a slope: one field too many and every request 431s.
  cookies.set(COOKIE.session, JSON.stringify(opts.user), {
    ...base,
    sameSite: 'lax',
    expires,
  });
}

export function clearSessionCookies(cookies: ResponseCookies): void {
  cookies.set(COOKIE.access, '', { ...base, sameSite: 'lax', maxAge: 0 });
  cookies.set(COOKIE.refresh, '', {
    ...base,
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: 0,
  });
  cookies.set(COOKIE.session, '', { ...base, sameSite: 'lax', maxAge: 0 });
}
