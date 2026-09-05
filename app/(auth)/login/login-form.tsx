'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';

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
};

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

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

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
            <Alert variant="destructive">
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
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
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
