import type { Metadata } from 'next';

import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

/**
 * RSC shell. Reads the query string the middleware appended (`next` for the
 * deep link the user was reaching for, `reason` for why they landed here) and
 * hands both to the client form.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const { next, reason } = await searchParams;
  return <LoginForm next={next} reason={reason} />;
}
