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

/**
 * Ceiling for a single upstream call, sized for a Render free-tier cold start
 * (~30-60s) rather than a healthy request — see the note on the axios client
 * in lib/api/http.ts.
 *
 * Bare `fetch` is NOT unbounded but its undici default is ~300s, which on the
 * login path means a spinner that outlives the user's patience by minutes. An
 * explicit signal makes the ceiling deliberate and reviewable.
 *
 * COUPLED to IN_FLIGHT_TTL_MS in app/api/auth/refresh/route.ts, which must
 * stay comfortably ABOVE this value. That map collapses concurrent rotations
 * of the same refresh token onto one upstream call; if its entry were dropped
 * while a slow call was still in flight, a second caller would start a second
 * rotation of the same single-use token, trip the backend's reuse detection,
 * and sign the account out of every device.
 */
export const UPSTREAM_TIMEOUT_MS = 60_000;

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
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    // Separate the two failures. They look identical in a log and mean
    // opposite things to the person waiting: a timeout on a sleeping free-tier
    // instance is fixed by pressing the button again, while "unreachable" is
    // a wrong URL or a dead service and retrying is pointless.
    //
    // Both stay 503, which matters: the refresh route treats 503 as "do not
    // clear the cookies", so a cold start can never sign anyone out.
    const timedOut = err instanceof DOMException && err.name === 'TimeoutError';
    throw new AuthUpstreamError({
      status: 503,
      message: timedOut
        ? 'The Taafi API did not respond in time. It sleeps after 15 minutes ' +
          'idle and the first request has to wait for it to wake — try once more.'
        : `Cannot reach the Taafi API at ${SERVER_API_ORIGIN}. Is the backend running?`,
      errorCode: timedOut ? 'upstream_timeout' : 'upstream_unreachable',
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
 * expands to the whole back office, so one value matches every staff role.
 * The response still carries the real DB role in `user.role` — it is never
 * collapsed.
 *
 * That expansion is load-bearing. A back-office role the backend forgets to
 * list there cannot sign in to this console at all, and it fails as a
 * role-mismatch 403 rather than anything that names the real cause.
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
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
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

/**
 * Admin console account recovery. Both calls hit `/api/admin/auth/*`, which
 * is mounted ABOVE the back-office guard in `backend/src/routes/admin.js` and
 * is therefore reachable with no session — which is the entire point, since
 * the caller is someone who cannot sign in.
 *
 * The form asks for an EMAIL because that is what staff sign in with, but the
 * code is texted to the phone on that account. This deployment has no mail
 * transport; recovery has always been the SMS OTP path. `sentTo` comes back
 * as a masked hint of the destination so the operator knows which handset to
 * pick up.
 *
 * ANTI-ENUMERATION: an unknown email, a non-staff account and a suspended one
 * all return the same cheerful 200 as a real dispatch, minus `sentTo`. Do not
 * "improve" the UI by reporting an unknown address — that hands an
 * unauthenticated caller a list of which addresses hold console access.
 */
export interface ForgotPasswordResultWire {
  success: boolean;
  message: string;
  /** Masked destination, e.g. `•••••00002`. Absent when nothing was sent. */
  sentTo?: string;
  expiresIn: number;
  resendCooldown: number;
  otpLength: number;
}

/** `POST /admin/auth/forgot-password` — texts a recovery code. */
export function adminForgotPassword(input: {
  email: string;
}): Promise<ForgotPasswordResultWire> {
  return post<ForgotPasswordResultWire>(`${P.admin}/auth/forgot-password`, {
    email: input.email.trim().toLowerCase(),
  });
}

/**
 * `POST /admin/auth/reset-password` — spends the code and sets the password.
 *
 * Deliberately returns NO session. The operator is handed back to the sign-in
 * form to use the credential they just chose, which proves it works while
 * they are still in front of it and keeps session minting on one path.
 */
export function adminResetPassword(input: {
  email: string;
  otp: string;
  newPassword: string;
}): Promise<{ success: boolean; message: string }> {
  return post(`${P.admin}/auth/reset-password`, {
    email: input.email.trim().toLowerCase(),
    otp: input.otp.trim(),
    newPassword: input.newPassword,
  });
}
