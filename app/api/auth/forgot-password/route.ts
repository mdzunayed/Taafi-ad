import { NextResponse } from 'next/server';

import { AuthUpstreamError, adminForgotPassword } from '@/lib/auth/upstream';
import { forbiddenOrigin, isSameOrigin } from '@/lib/auth/origin-check';

export const runtime = 'nodejs';

/**
 * `POST /api/auth/forgot-password` — step one of console recovery.
 *
 * A thin pass-through to `/api/admin/auth/forgot-password`. It exists for the
 * same reason the login route does: the browser never talks to Express
 * directly, and the same-origin check is what keeps another site from driving
 * this endpoint with a victim's cookies.
 *
 * Mints no cookie and reads none — the caller has no session by definition.
 *
 * The upstream body is forwarded VERBATIM on success. Its anti-enumeration
 * contract (unknown email, non-staff account and suspended account all answer the
 * same 200 as a real send) only holds if this layer does not add a distinction
 * of its own, so resist "helpfully" reporting an unrecognised address here.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return forbiddenOrigin();

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: 'Malformed request.' },
      { status: 400 },
    );
  }

  const email = (body.email ?? '').trim();
  if (!email) {
    return NextResponse.json(
      { success: false, message: 'Enter the email address for your staff account.' },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await adminForgotPassword({ email }));
  } catch (err) {
    if (err instanceof AuthUpstreamError) {
      return NextResponse.json(
        { success: false, message: err.message, error_code: err.errorCode },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { success: false, message: 'Could not send a recovery code. Please try again.' },
      { status: 500 },
    );
  }
}
