import { NextResponse, type NextRequest } from 'next/server';

import { COOKIE } from '@/lib/auth/cookie-names';
import { decodeJwt } from '@/lib/auth/jwt';
import { BACK_OFFICE_ROLES } from '@/lib/rbac/permissions';

/**
 * Request gate for `/dashboard/*`.
 *
 * (Next.js called this file `middleware.ts` through v15. Next 16 renamed the
 * convention to `proxy.ts` and the export to `proxy`, and moved it to the
 * Node.js runtime by default — the `runtime` segment option is not available
 * here and setting it throws.)
 *
 * WHAT THIS IS: a routing and UX gate. It stops a deep link from painting the
 * whole dashboard shell before the client discovers there is no session, and
 * it preserves the intended destination across the login round-trip.
 *
 * WHAT THIS IS NOT: a security boundary. The token below is DECODED, NOT
 * VERIFIED, so anyone can forge a cookie containing
 * `{"role":"super_admin","exp":9999999999}` and get past this line. What they
 * receive is an empty shell: every byte of data on this portal is fetched from
 * Express, which verifies the signature and answers 401.
 *
 * That is a deliberate choice rather than a limitation. Running on Node means
 * we *could* hold `JWT_SECRET` here and verify properly — but that copies the
 * platform's signing key into a second deployment, widening the blast radius
 * of any compromise of this app, to harden a gate that guards nothing but an
 * empty shell. If you ever decide otherwise, it is `jwtVerify` from `jose`
 * plus one env var, and this comment needs rewriting.
 *
 * Two rules follow from decode-only, and both matter:
 *   1. Never render anything sensitive from this payload. Role decides nav
 *      *shape*; it never decides what data is allowed through.
 *   2. Do not attempt a refresh here. Rotation is single-use and must stay
 *      serialised behind the browser's Web Lock (lib/auth/refresh.ts); a
 *      proxy-initiated refresh would be a second, unsynchronised caller and
 *      the loser of that race signs the user out of every device.
 *
 * Per-route permission checks are deliberately absent too. Putting
 * `audit-log → view_audit_log` in the matcher would imply this layer enforces
 * it, and it demonstrably cannot.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(COOKIE.access)?.value;
  const payload = decodeJwt(token);

  const expired =
    !payload?.exp || Date.now() >= payload.exp * 1000;
  const isBackOffice =
    !!payload?.role &&
    (BACK_OFFICE_ROLES as readonly string[]).includes(payload.role);

  if (!token || expired || !isBackOffice) {
    const login = new URL('/login', request.url);
    // Round-trip the destination so a deep link survives sign-in.
    if (pathname !== '/dashboard') login.searchParams.set('next', pathname + search);
    if (token && expired) login.searchParams.set('reason', 'session_expired');
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
