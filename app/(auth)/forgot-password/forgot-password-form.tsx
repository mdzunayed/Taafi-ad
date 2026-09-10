'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';

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

/** Server floor, mirrored so a doomed request never leaves the browser. */
const MIN_PASSWORD = 8;

/**
 * Console account recovery, in two steps on one screen.
 *
 *   'request'  enter the staff email → a code is texted to the phone on file
 *   'verify'   enter that code and choose a new password
 *
 * ── Why the email asks one thing and the code arrives somewhere else ───────
 *
 * Staff sign in with an email, so that is what the first step asks for. The
 * code goes to the PHONE on that account: this deployment has no mail
 * transport, and recovery has always run over the SMS OTP service. The server
 * returns a masked hint of the destination so the operator knows which
 * handset to pick up.
 *
 * ── Why step one never says "no such account" ──────────────────────────────
 *
 * An unknown email, a non-staff account and a suspended one all come back as
 * the same success. That is the server's anti-enumeration contract and this
 * screen must not undo it: a distinguishable "unknown address" would hand an
 * unauthenticated caller a list of which addresses hold console access. So
 * step one ALWAYS advances, and a wrong address simply produces a code that
 * never arrives.
 *
 * The email is kept in state across the step change because the verify call
 * needs it again — the server resolves the account from it a second time
 * rather than trusting a client-held handle.
 */
export function ForgotPasswordForm() {
  const router = useRouter();
  const [step, setStep] = useState<'request' | 'verify'>('request');

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Resend cooldown. The server enforces its own 60s window and answers 429
  // regardless of what this shows; the countdown exists so the operator is
  // told why the button is inert instead of pressing a dead control.
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function requestCode(event?: React.FormEvent) {
    event?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        // Surfaced verbatim. This is where the cooldown and the hourly quota
        // speak, and their wording carries the retry window.
        setError(data?.message ?? 'Could not send a code. Please try again.');
        return;
      }

      setSentTo(typeof data?.sentTo === 'string' ? data.sentTo : null);
      setCooldown(Number(data?.resendCooldown) || 60);
      setStep('verify');
    } catch {
      setError('Could not reach the recovery service. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    // Checked here so an obvious mismatch never spends the code. The OTP is
    // single-use: letting the server consume it and THEN rejecting the
    // password would force a whole new round of SMS for a typo.
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Those two passwords do not match.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/forgot-password/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, otp, newPassword: password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.message ?? 'Could not reset your password.');
        return;
      }

      // No session is minted by design, so this goes to the sign-in form
      // rather than the dashboard. `reason` renders the confirmation there.
      router.replace('/login?reason=password_reset');
    } catch {
      setError('Could not reach the recovery service. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {step === 'request' ? 'Reset your password' : 'Enter your code'}
        </CardTitle>
        <CardDescription>
          {step === 'request' ? (
            'Enter your staff email. We will text a verification code to the phone number on your account.'
          ) : sentTo ? (
            <>
              We sent a code to the number ending {sentTo}. It expires shortly.
            </>
          ) : (
            'If that email belongs to a staff account, a code is on its way to the phone number on file.'
          )}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {step === 'request' ? (
          <form onSubmit={requestCode} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Staff email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                placeholder="admin@taafi.app"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Send code
            </Button>

            <BackToSignIn />
          </form>
        ) : (
          <form onSubmit={submitReset} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="otp">Verification code</Label>
              {/*
                `inputMode="numeric"` raises the number pad on a phone, which
                is where an operator reading an SMS most often is. Not
                `type="number"` — that brings spinners and strips leading
                zeros, and a code is a string of digits, not a quantity.
              */}
              <Input
                id="otp"
                name="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pr-10"
                />
                {/* `type="button"`: a bare button in a form submits it, which
                    here would spend the single-use code. */}
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
              <p className="text-muted-foreground text-xs">
                At least {MIN_PASSWORD} characters.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input
                id="confirm"
                name="confirm"
                // Deliberately never revealed by the toggle above. The point
                // of this field is to catch a typo by re-entry; showing both
                // lets the eye copy the first one and defeats it.
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Set new password
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={busy || cooldown > 0}
              onClick={() => void requestCode()}
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </Button>

            <BackToSignIn />
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function BackToSignIn() {
  return (
    <Link
      href="/login"
      className="text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 text-xs"
    >
      <ArrowLeft className="size-3.5" />
      Back to sign in
    </Link>
  );
}
