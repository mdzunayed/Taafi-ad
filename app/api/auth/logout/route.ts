import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { COOKIE, clearSessionCookies } from '@/lib/auth/cookies';
import { logout } from '@/lib/auth/upstream';
import { forbiddenOrigin, isSameOrigin } from '@/lib/auth/origin-check';

export const runtime = 'nodejs';

/**
 * `POST /api/auth/logout`.
 *
 * Revokes the refresh token server-side (best effort) and clears all three
 * cookies. The cookie clear is unconditional: if the API is unreachable, the
 * user still gets signed out of this browser rather than being trapped in a
 * session they asked to end.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return forbiddenOrigin();

  const store = await cookies();
  await logout(store.get(COOKIE.refresh)?.value);

  const res = NextResponse.json({ success: true });
  clearSessionCookies(res.cookies);
  return res;
}
