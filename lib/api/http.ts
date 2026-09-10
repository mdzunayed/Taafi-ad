'use client';

import axios, {
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios';

import { API_ORIGIN } from './paths';
import { ApiError, normalizeError, isAccountInactive } from './errors';
import { getAccessToken } from '@/lib/auth/token-store';
import { endSession, ensureFreshToken } from '@/lib/auth/refresh';
import { isSessionOver } from '@/lib/auth/session-state';

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

export const api = axios.create({
  baseURL: API_ORIGIN,
  // Sized for a Render FREE-TIER COLD START, not for a healthy request. The
  // instance sleeps after 15 minutes idle and the next call waits out a full
  // container boot (~30-60s). At the previous 30s budget the first request of
  // a session timed out just short of the server waking, and the console
  // showed empty tables on a backend that was fine — the same failure the
  // Flutter client hit, which is why DioClient uses 60s too.
  //
  // A warm request still answers in well under a second, so this only ever
  // costs time on the wake-up path.
  timeout: 60_000,
  headers: { Accept: 'application/json' },
  // Never true. No cookie of ours is meant to reach Express, and the backend
  // currently reflects any origin when CORS_ALLOWED_ORIGINS is unset — which
  // combined with credentials would be a genuine hazard.
  withCredentials: false,
});

/**
 * ────────────────────────────────────────────────────────────────────────────
 * DO NOT ADD HEADERS HERE.
 *
 * The backend's CORS config declares a closed `allowedHeaders` list:
 *
 *     ['Content-Type', 'Authorization', 'x-account-id', 'X-Account-Id']
 *
 * Anything else — `X-Request-Id`, `Idempotency-Key`, `Cache-Control`, a
 * tracing header — fails the *preflight*, not the request. The browser then
 * reports a network error with no status code and no response, which is
 * indistinguishable from the API being down. Adding a header here is the
 * single most expensive hour available to lose on this project.
 * ────────────────────────────────────────────────────────────────────────────
 */
api.interceptors.request.use(async (config) => {
  // Hard stop once the session has ended. The redirect out of `endSession()`
  // is scheduled, not instant, so this document can stay alive for a while
  // yet — and every request it makes in that window is guaranteed to be a
  // 401. Failing here costs no round trip and, crucially, cannot re-enter the
  // response interceptor's refresh-and-retry path. See lib/auth/session-state.
  if (isSessionOver()) {
    throw new ApiError({
      status: 401,
      message: 'Your session has ended. Please sign in again.',
      errorCode: 'session_over',
    });
  }

  const token = await getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function isAuthPath(url: string | undefined): boolean {
  return !!url && (url.includes('/auth/') || url.startsWith('/api/auth'));
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    // Our own request-interceptor rejection for a dead session. It never
    // reached the network, so there is nothing to refresh and nothing to
    // normalize — hand it straight back.
    if (error instanceof ApiError) return Promise.reject(error);

    const config = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    // A 401 from an auth endpoint is bad credentials, not an expired session.
    // Refreshing there would be nonsense (and could consume a good token).
    if (status === 401 && config && !isAuthPath(config.url) && !config._retried) {
      config._retried = true;
      const refreshed = await ensureFreshToken();
      if (refreshed) {
        config.headers.Authorization = `Bearer ${refreshed.token}`;
        return api.request(config);
      }
      endSession('session_expired');
      return Promise.reject(normalizeError(error));
    }

    if (status === 401 && config && !isAuthPath(config.url)) {
      endSession('session_expired');
      return Promise.reject(normalizeError(error));
    }

    const normalized = normalizeError(error);

    // The JWT lives seven days, but every guard re-reads the account from
    // Mongo. A deactivated admin therefore keeps a technically valid token and
    // gets this on every single call. It is a sign-out, not a permission
    // banner.
    if (isAccountInactive(normalized)) {
      endSession('account_inactive');
    }

    return Promise.reject(normalized);
  },
);

/**
 * Retry policy for mutations: there isn't one.
 *
 * The single post-refresh replay above is the only automatic retry in this
 * client. A duplicated `POST /finance/payouts/:id/approve` is real money
 * leaving the business twice.
 */
export const MUTATION_RETRY = 0;
