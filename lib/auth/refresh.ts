'use client';

import type { SessionPayload } from '@/types/wire/auth';
import {
  clearToken,
  peekToken,
  readSessionFromServer,
  setToken,
} from './token-store';
import { isSessionOver, markSessionOver } from './session-state';

/**
 * Refresh serialisation.
 *
 * WHY THIS IS MORE THAN HOUSEKEEPING: the backend's `rotateRefreshToken` is a
 * non-atomic read-modify-write, and rotation is single-use with reuse
 * detection. Two refreshes carrying the same raw token can both succeed and
 * mint two chains; the orphaned chain gets replayed later, trips the reuse
 * check, and `revokeAllForAccount` signs the account out of EVERY device.
 * "Two tabs open" is enough to cause it. So the goal here is not efficiency,
 * it is never letting a second caller reach `/auth/refresh` concurrently.
 *
 * Layer 1 — in-tab single flight (below).
 * Layer 2 — cross-tab Web Lock with a double-checked read (below). This is
 *           the one actually relied upon.
 * Layer 3 — server-side idempotency map in app/api/auth/refresh/route.ts.
 */

const LOCK = 'taafi-refresh';
export const AUTH_CHANNEL = 'taafi-auth';

/** Layer 1: one in-flight refresh per tab. */
let inFlight: Promise<SessionPayload | null> | null = null;

/** Broadcast a terminal session end so sibling tabs stop trying. */
export function broadcastSignOut(reason: string): void {
  try {
    new BroadcastChannel(AUTH_CHANNEL).postMessage({ type: 'signed_out', reason });
  } catch {
    // BroadcastChannel is unavailable in some embedded webviews; the other
    // tabs will simply discover the dead session on their next request.
  }
}

async function postRefresh(): Promise<SessionPayload | null> {
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) return null;
  const payload = (await res.json()) as SessionPayload;
  setToken({ token: payload.token, expiresAt: payload.expiresAt });
  return payload;
}

/**
 * Rotate under the cross-tab lock.
 *
 * The double-checked read is the important part: once this tab holds the
 * lock, it re-reads the session cookie. If the token there is no longer the
 * stale one it set out to replace, another tab already rotated — so it
 * returns that fresh token and never consumes the refresh credential.
 */
async function rotate(staleToken: string | null): Promise<SessionPayload | null> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;

  const critical = async (): Promise<SessionPayload | null> => {
    const current = await readSessionFromServer();
    if (current && current.token !== staleToken) return current;
    return postRefresh();
  };

  if (!locks) {
    // Degraded path: layers 1 and 3 still apply.
    return critical();
  }
  return locks.request(LOCK, critical);
}

/**
 * Ensure the in-memory token is usable, refreshing at most once.
 * Returns the fresh token, or null when the session is over.
 */
export function ensureFreshToken(): Promise<SessionPayload | null> {
  // The session is already over. Rotating now would consume the single-use
  // refresh credential on behalf of a document that is on its way to /login,
  // and a rotation that lands after the redirect is an orphaned chain — the
  // exact thing the reuse detector signs every device out over.
  if (isSessionOver()) return Promise.resolve(null);
  if (inFlight) return inFlight;
  const stale = peekToken();
  inFlight = rotate(stale)
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Terminal: latch the session closed, drop local state, tell the other tabs,
 * and go to /login.
 *
 * Idempotent, and that is load-bearing rather than defensive. The overview
 * polls three queries on the same 30s tick, so an expiry produces three
 * simultaneous 401s that all land here. Without the latch that is three
 * sign-out broadcasts and three `location.replace` calls, and — because
 * `clearToken()` has already run by the second one — a fresh
 * `/api/auth/session` bootstrap behind each of them.
 *
 * Latching BEFORE `clearToken()` is deliberate: it closes the window in which
 * a concurrent request could observe a null token and start a bootstrap.
 */
export function endSession(reason: 'session_expired' | 'account_inactive'): void {
  if (!markSessionOver()) return;
  clearToken();
  broadcastSignOut(reason);
  if (typeof window !== 'undefined') {
    const url = new URL('/login', window.location.origin);
    url.searchParams.set('reason', reason);
    // Hard navigation, not a router push: every cached query and provider in
    // this document is now describing a session that no longer exists.
    window.location.replace(url.toString());
  }
}
