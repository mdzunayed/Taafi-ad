import { NextResponse } from 'next/server';

import { AuthUpstreamError, adminResetPassword } from '@/lib/auth/upstream';
import { forbiddenOrigin, isSameOrigin } from '@/lib/auth/origin-check';

export const runtime = 'nodejs';

/**
 * `POST /api/auth/forgot-password/verify` — step two of console recovery:
 * spend the texted code and set the new password.
 *
 * Nested under `forgot-password` rather than sitting at `/api/auth/
 * reset-password`, which would read as a sibling of the SIGNED-IN forced
 * reset the `/reset-password` screen performs. Those two are different
 * operations with different credentials — one presents a bearer token, this
 * one presents an OTP — and giving them adjacent names invites someone to
 * wire a screen to the wrong one.
 *
 * Mints no session on success, matching the upstream contract: the operator
 * is sent back to sign in with the password they just chose.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return forbiddenOrigin();

  let body: { email?: string; otp?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: 'Malformed request.' },
      { status: 400 },
    );
  }

  const email = (body.email ?? '').trim();
  const otp = (body.otp ?? '').trim();
  const newPassword = body.newPassword ?? '';

  if (!email || !otp || !newPassword) {
    return NextResponse.json(
      {
        success: false,
        message: 'Enter the code from your phone and choose a new password.',
      },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await adminResetPassword({ email, otp, newPassword }));
  } catch (err) {
    if (err instanceof AuthUpstreamError) {
      return NextResponse.json(
        { success: false, message: err.message, error_code: err.errorCode },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { success: false, message: 'Could not reset your password. Please try again.' },
      { status: 500 },
    );
  }
}
