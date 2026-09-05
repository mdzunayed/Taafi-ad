'use client';

import { useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  type QueryClientConfig,
} from '@tanstack/react-query';

import { ApiError } from '@/lib/api/errors';

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
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
