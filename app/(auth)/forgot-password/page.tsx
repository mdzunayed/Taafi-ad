import type { Metadata } from 'next';

import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = { title: 'Reset your password' };

/**
 * Console account recovery. Sits in the `(auth)` group so it inherits the
 * sign-in chrome, and outside the `/dashboard/:path*` matcher in proxy.ts so
 * it is reachable with no session — which is the whole point.
 */
export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
