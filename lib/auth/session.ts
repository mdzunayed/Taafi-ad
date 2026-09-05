import 'server-only';

import { cookies } from 'next/headers';

import { COOKIE } from './cookie-names';
import { expiryMs, isExpired } from './jwt';
import type { SessionUser } from '@/types/wire/auth';

export interface ServerSession {
  user: SessionUser;
  token: string;
  expiresAt: number | null;
}

/**
 * Reads the session out of the httpOnly cookies during a server render.
 *
 * This is a COOKIE READ, not an API call — which is exactly why it is worth
 * having. It lets the dashboard layout render the sidebar already filtered to
 * the user's role on first paint, with no loading shell and no flash of a
 * destination they cannot open.
 *
 * Returns null when signed out; the caller redirects.
 */
export async function readSession(): Promise<ServerSession | null> {
  const store = await cookies();
  const token = store.get(COOKIE.access)?.value;
  const raw = store.get(COOKIE.session)?.value;

  if (!token || !raw || isExpired(token)) return null;

  try {
    return {
      user: JSON.parse(raw) as SessionUser,
      token,
      expiresAt: expiryMs(token),
    };
  } catch {
    return null;
  }
}
