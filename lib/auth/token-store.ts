'use client';

import type { SessionPayload } from '@/types/wire/auth';

/**
 * The access token lives HERE — a module-level variable — and nowhere else on
 * the client. Not localStorage, not sessionStorage.
 *
 * The httpOnly cookie is the durable copy; this is the working copy the axios
 * interceptor reads on every request. The distinction matters: an XSS on this
 * page can ride the open tab (bad) but cannot exfiltrate a 30-day refresh
 * token (catastrophic), because the refresh credential is httpOnly and
 * path-scoped and this module never sees it.
 */
let accessToken: string | null = null;
let expiresAt: number | null = null;

/** De-duplicates the bootstrap read so a burst of first requests makes one call. */
let bootstrap: Promise<SessionPayload | null> | null = null;

export function setToken(payload: {
  token: string;
  expiresAt: number | null;
}): void {
  accessToken = payload.token;
  expiresAt = payload.expiresAt;
}

export function clearToken(): void {
  accessToken = null;
  expiresAt = null;
  bootstrap = null;
}

export function peekToken(): string | null {
  return accessToken;
}

export function tokenExpiresAt(): number | null {
  return expiresAt;
}

/** Reads the session cookie back through the BFF. Null when signed out. */
export async function readSessionFromServer(): Promise<SessionPayload | null> {
  const res = await fetch('/api/auth/session', {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!res.ok) return null;
  const payload = (await res.json()) as SessionPayload;
  setToken({ token: payload.token, expiresAt: payload.expiresAt });
  return payload;
}

/**
 * The token for an outgoing request, hydrating from the cookie if this is the
 * first call after a hard reload. Concurrent callers share one round-trip.
 */
export async function getAccessToken(): Promise<string | null> {
  if (accessToken) return accessToken;
  if (!bootstrap) {
    bootstrap = readSessionFromServer().finally(() => {
      bootstrap = null;
    });
  }
  const payload = await bootstrap;
  return payload?.token ?? null;
}
