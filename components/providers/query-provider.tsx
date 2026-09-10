'use client';

import { useEffect, useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  type QueryClientConfig,
} from '@tanstack/react-query';

import { ApiError } from '@/lib/api/errors';
import { onSessionOver } from '@/lib/auth/session-state';

const config: QueryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry(failureCount, error) {
        // A 401 has already been handled by the axios interceptor (refresh or
        // sign-out); a 403/404 will not improve on a second attempt.
        if (error instanceof ApiError) {
          if ([401, 403, 404, 409].includes(error.status)) return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      // Never. Every mutation on this portal is non-idempotent, and several
      // move money: a retried payout approval pays twice.
      retry: 0,
    },
  },
};

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient(config));

  // Abort everything still in flight the moment the session ends.
  //
  // The polled queries drop their own timers (lib/auth/session-state.ts), but
  // a request already on the wire has up to the client's 60s cold-start budget
  // left to run. Cancelling here means the sign-out is quiet: no late 401
  // resolving into a component that is mid-teardown, and no error toast fired
  // at a user who is already looking at the login screen.
  //
  // Cancel only — the cache is deliberately left alone. Clearing it would
  // re-render every mounted table as empty during the redirect, which reads as
  // "your data is gone" rather than "you were signed out".
  useEffect(() => onSessionOver(() => void client.cancelQueries()), [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
