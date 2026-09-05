import { NextResponse } from 'next/server';

import { setSessionCookies, toSessionUser } from '@/lib/auth/cookies';
import { AuthUpstreamError, login } from '@/lib/auth/upstream';
import { forbiddenOrigin, isSameOrigin } from '@/lib/auth/origin-check';
import { isBackOfficeRole } from '@/lib/rbac/permissions';
import { expiryMs } from '@/lib/auth/jwt';
import type { SessionPayload } from '@/types/wire/auth';

export const runtime = 'nodejs';

/**
 * `POST /api/auth/login` — the BFF's front door.
 *
 * Takes the credential, exchanges it with Express, and turns the JSON token
 * pair into httpOnly cookies. The access token is ALSO returned in the body,
 * because the browser needs it for its `Authorization` header on every data
 * call — the cookie copy exists so Edge middleware can gate `/dashboard/*`
 * before any HTML renders.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return forbiddenOrigin();

  let body: { identifier?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: 'Malformed request.' },
      { status: 400 },
    );
  }

  const identifier = (body.identifier ?? '').trim();
  const password = body.password ?? '';
  if (!identifier || !password) {
    return NextResponse.json(
      { success: false, message: 'Enter your email or phone and password.' },
      { status: 400 },
    );
  }

  try {
    const upstream = await login({ identifier, password });

    // A clinician or patient credential can technically satisfy the login
    // route; this portal is not for them. Refuse before minting any cookie.
    if (!isBackOfficeRole(upstream.user.role)) {
      return NextResponse.json(
        {
          success: false,
          message:
            'This portal is for Taafi staff accounts. Patients and clinicians should use the Taafi mobile app.',
          error_code: 'not_back_office',
        },
        { status: 403 },
      );
    }

    const user = toSessionUser(upstream.user);
    const payload: SessionPayload & { requiresReset: boolean } = {
      user,
      token: upstream.token,
      expiresAt: expiryMs(upstream.token),
      // Admin-provisioned accounts carry a forced-reset latch. Ignoring it
      // drops someone into a working-looking dashboard while the server still
      // considers their password temporary.
      requiresReset: upstream.requiresReset === true,
    };

    const res = NextResponse.json(payload);
    setSessionCookies(res.cookies, {
      token: upstream.token,
      refreshToken: upstream.refreshToken,
      user,
    });
    return res;
  } catch (err) {
    if (err instanceof AuthUpstreamError) {
      return NextResponse.json(
        {
          success: false,
          message: err.message,
          error_code: err.errorCode,
        },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { success: false, message: 'Sign-in failed. Please try again.' },
      { status: 500 },
    );
  }
}
