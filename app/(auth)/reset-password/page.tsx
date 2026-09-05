import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { readSession } from '@/lib/auth/session';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = { title: 'Set a new password' };

/**
 * Landing for the `requiresReset` latch.
 *
 * The backend sets `requires_password_reset` on any account created through
 * `POST /admin/register-sub-admin` or `create-provider`, which hand out a
 * temporary password. Until it is cleared the account is signed in but is
 * still holding a credential someone else has seen.
 */
export default async function ResetPasswordPage() {
  const session = await readSession();
  if (!session) redirect('/login');
  return <ResetPasswordForm />;
}
