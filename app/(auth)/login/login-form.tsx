'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { setToken } from '@/lib/auth/token-store';

const REASON_COPY: Record<string, string> = {
  session_expired: 'Your session expired. Please sign in again.',
  account_inactive:
    'This account has been deactivated. Contact a super admin if that is unexpected.',
  signed_out: 'You have been signed out.',
  // Set by /forgot-password after a successful recovery. It is a success
  // message rendered in the error slot, so the alert below picks its variant
  // from this set rather than assuming everything here is a failure.
  password_reset:
    'Your password has been reset. Sign in with your new password.',
};

/** Reasons that report good news, so the banner is not painted as an error. */
const POSITIVE_REASONS = new Set(['password_reset']);

export function LoginForm({
  next,
  reason,
}: {
  next?: string;
  reason?: string;
}) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    reason ? (REASON_COPY[reason] ?? null) : null,
  );
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Only true for the banner the page LOADED with. Any error raised by a
  // submit below is a real failure, and `setError` never restores this.
  const [notice, setNotice] = useState(
    reason ? POSITIVE_REASONS.has(reason) : false,
  );

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(false);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        // Surface the server's copy verbatim. It is written for the user, and
        // it is the only thing that distinguishes a bad password from the
        // 5-failures-per-15-minutes lockout the whole office shares behind one
        // NAT address. Never auto-retry a login.
        setError(data?.message ?? 'Sign-in failed. Please try again.');
        return;
      }

      setToken({ token: data.token, expiresAt: data.expiresAt });

      // Admin-provisioned accounts carry a forced-reset latch server-side.
      // Ignoring it drops someone into a working-looking dashboard while
      // `requires_password_reset` is still set on their row.
      if (data.requiresReset) {
        router.replace('/reset-password');
        return;
      }

      router.replace(next && next.startsWith('/') ? next : '/dashboard/overview');
      router.refresh();
    } catch {
      setError('Could not reach the sign-in service. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Sign in</CardTitle>
        <CardDescription>
          Use your Taafi staff email or phone number.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          {error && (
            <Alert variant={notice ? 'default' : 'destructive'}>
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="identifier">Email or phone</Label>
            <Input
              id="identifier"
              name="identifier"
              autoComplete="username"
              placeholder="admin@taafi.app"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="password">Password</Label>
              {/*
                Sits on the label row, not under the button. Someone who
                cannot get in looks at the field that is refusing them, and a
                recovery link below the submit is routinely missed there.
              */}
              <Link
                href="/forgot-password"
                className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
              >
                Forgot password?
              </Link>
            </div>
            {/*
              `relative` + right padding on the input is what keeps the toggle
              inside the field. Padding matters: without it a long password
              scrolls underneath the button and the last characters typed are
              hidden by the control meant to reveal them.
            */}
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pr-10"
              />
              {/*
                `type="button"` is load-bearing. A bare <button> inside a
                <form> defaults to type="submit", so revealing the password
                would submit the form — and on a half-typed password that is a
                failed attempt against the 5-per-15-minute IP lockout.

                Not focusable by keyboard: `tabIndex={-1}` keeps Tab going
                password → Sign in, the path someone typing a credential
                expects. Screen readers still reach it by name, and the label
                names the ACTION so it reads correctly in both states.
              */}
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
