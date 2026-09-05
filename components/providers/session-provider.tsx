'use client';

import { createContext, useContext, useEffect, useMemo } from 'react';

import { setToken } from '@/lib/auth/token-store';
import { AUTH_CHANNEL, endSession } from '@/lib/auth/refresh';
import {
  effectivePermissionsFor,
  type Permission,
} from '@/lib/rbac/permissions';
import type { SessionUser } from '@/types/wire/auth';

interface SessionContextValue {
  user: SessionUser;
  role: string;
  permissions: Permission[];
  isSuperAdmin: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Carries the identity read from the httpOnly session cookie by the dashboard
 * RSC layout, so the sidebar renders already filtered on first paint with no
 * flash of a link the user cannot use.
 *
 * This is a UI hint and never an authorization input — the API re-checks
 * everything. See lib/rbac/capabilities.ts.
 */
export function SessionProvider({
  user,
  initialToken,
  children,
}: {
  user: SessionUser;
  initialToken?: { token: string; expiresAt: number | null };
  children: React.ReactNode;
}) {
  // Seed the in-memory token on first render so the very first data request
  // does not have to round-trip /api/auth/session to discover it.
  if (initialToken && typeof window !== 'undefined') {
    setToken(initialToken);
  }

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(AUTH_CHANNEL);
      channel.onmessage = (event: MessageEvent) => {
        if (event.data?.type === 'signed_out') {
          // Another tab's refresh failed terminally. Do not start our own —
          // that is exactly the storm that trips reuse detection.
          window.location.replace(`/login?reason=${event.data.reason ?? 'session_expired'}`);
        }
      };
    } catch {
      // No BroadcastChannel here; each tab will notice on its next request.
    }
    return () => channel?.close();
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      role: user.role,
      permissions: effectivePermissionsFor(user),
      isSuperAdmin: user.role === 'super_admin',
    }),
    [user],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used inside the dashboard layout.');
  }
  return ctx;
}

export { endSession };
