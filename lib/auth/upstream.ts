import 'server-only';

import { SERVER_API_ORIGIN } from '@/lib/config/env';
import { P } from '@/lib/api/paths';
import type { LoginResponseWire, RefreshResponseWire } from '@/types/wire/auth';

/**
 * Server-to-server calls to the Express auth router. These four functions are
 * the ONLY code in the portal that talks to `/auth/*`; everything else goes
 * browser → Express with a bearer.
 */

export interface UpstreamError {
  status: number;
  message: string;
  errorCode: string | null;
  /** Echoed by the backend on `requires_verification`. */
  phone?: string;
}

export class AuthUpstreamError extends Error implements UpstreamError {
  status: number;
  errorCode: string | null;
  phone?: string;

  constructor(e: UpstreamError) {
    super(e.message);
    this.name = 'AuthUpstreamError';
    this.status = e.status;
    this.errorCode = e.errorCode;
    this.phone = e.phone;
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_API_ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new AuthUpstreamError({
      status: 503,
      message: `Cannot reach the Taafi API at ${SERVER_API_ORIGIN}. Is the backend running?`,
      errorCode: 'upstream_unreachable',
    });
  }

  const data = (await res.json().catch(() => null)) as
    | (Record<string, unknown> & { message?: string; error_code?: string })
    | null;

  if (!res.ok) {
    throw new AuthUpstreamError({
      status: res.status,
      message: data?.message ?? `Sign-in failed (HTTP ${res.status}).`,
      errorCode: data?.error_code ?? null,
      phone: typeof data?.phone === 'string' ? data.phone : undefined,
    });
  }
  return data as T;
}

/**
 * `POST /auth/login`.
 *
 * `role: 'admin'` is deliberate: the backend's `dbRolesForClient('admin')`
 * expands to `['admin', 'support_member', 'super_admin']`, so one value
 * matches all three back-office roles. The response still carries the real
 * DB role in `user.role` — it is never collapsed.
 */
export function login(input: {
  identifier: string;
  password: string;
}): Promise<LoginResponseWire> {
  const isEmail = input.identifier.includes('@');
  return post<LoginResponseWire>(`${P.auth}/login`, {
    role: 'admin',
    [isEmail ? 'email' : 'phone']: input.identifier.trim(),
    password: input.password,
  });
}

/**
 * `POST /auth/refresh`.
 *
 * Rotation is single-use with reuse detection: replaying a token that has
 * already been consumed revokes EVERY session for that account. The client
 * side serialises calls so this is reached at most once per rotation — see
 * lib/auth/refresh.ts.
 */
export function refresh(refreshToken: string): Promise<RefreshResponseWire> {
  return post<RefreshResponseWire>(`${P.auth}/refresh`, { refreshToken });
}

/** `POST /auth/logout`. Best-effort by contract — always 200, even on garbage. */
export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  try {
    await post(`${P.auth}/logout`, { refreshToken });
  } catch {
    // The cookies get cleared regardless; a failed revoke must never block
    // the user from signing out of this browser.
  }
}

/** `POST /auth/complete-password-reset` — clears the `requiresReset` latch. */
export async function completePasswordReset(input: {
  token: string;
  newPassword: string;
}): Promise<void> {
  const res = await fetch(
    `${SERVER_API_ORIGIN}${P.auth}/complete-password-reset`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.token}`,
      },
      body: JSON.stringify({ newPassword: input.newPassword }),
      cache: 'no-store',
    },
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as {
      message?: string;
      error_code?: string;
    } | null;
    throw new AuthUpstreamError({
      status: res.status,
      message: data?.message ?? 'Could not set the new password.',
      errorCode: data?.error_code ?? null,
    });
  }
}
