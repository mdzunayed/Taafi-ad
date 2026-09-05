import { AxiosError } from 'axios';

/**
 * Normalised API failure.
 *
 * The backend speaks four different error dialects, because the admin router
 * predates its own envelope convention:
 *
 *   1. `{success:false, message, error_code, required?}`  modern guards
 *   2. `{success:false, message}`                          requireRole-era 4xx
 *   3. `{message}` with no `success` at all                the older handlers
 *   4. no body — HTML, a timeout, or a CORS preflight rejection
 *
 * So `error_code` may simply not exist. Never branch on it without a fallback.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly errorCode: string | null;
  /** Populated on `missing_permission`: the permissions the route wanted. */
  readonly required: string[];
  readonly raw: unknown;

  constructor(init: {
    status: number;
    message: string;
    errorCode?: string | null;
    required?: string[];
    raw?: unknown;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.errorCode = init.errorCode ?? null;
    this.required = init.required ?? [];
    this.raw = init.raw;
  }
}

function statusFallback(status: number): string {
  switch (status) {
    case 400:
      return 'That request was rejected as invalid.';
    case 401:
      return 'Your session has expired. Please sign in again.';
    case 403:
      return 'You do not have permission to do that.';
    case 404:
      return 'Not found.';
    case 409:
      return 'That record changed while you were working on it. Reload and try again.';
    case 413:
      return 'That file is too large.';
    case 415:
      return 'That file type is not supported.';
    case 429:
      return 'Too many attempts. Wait a few minutes and try again.';
    default:
      return status >= 500
        ? 'The server hit an error handling that request.'
        : `Request failed (HTTP ${status}).`;
  }
}

export function normalizeError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  if (err instanceof AxiosError) {
    const status = err.response?.status ?? 0;
    const data = err.response?.data as
      | (Record<string, unknown> & {
          message?: string;
          error?: string;
          error_code?: string;
          required?: string[];
        })
      | undefined;

    // status 0 means the request never got an HTTP answer. In development
    // that is nearly always CORS or a stopped backend, and saying so saves an
    // hour of staring at an empty network panel.
    if (status === 0) {
      return new ApiError({
        status: 0,
        message:
          'Cannot reach the Taafi API. Check that the backend is running and ' +
          'that this origin is listed in CORS_ALLOWED_ORIGINS.',
        errorCode: 'network_error',
        raw: err,
      });
    }

    const message =
      (typeof data?.message === 'string' && data.message) ||
      (typeof data?.error === 'string' && data.error) ||
      statusFallback(status);

    return new ApiError({
      status,
      message,
      errorCode: data?.error_code ?? null,
      required: Array.isArray(data?.required) ? data.required : [],
      raw: data ?? err,
    });
  }

  return new ApiError({
    status: 0,
    message: err instanceof Error ? err.message : 'Something went wrong.',
    raw: err,
  });
}

/** A 403 the user could plausibly fix by asking someone — not a broken page. */
export function isPermissionError(err: unknown): boolean {
  const e = err instanceof ApiError ? err : null;
  if (!e) return false;
  return (
    e.status === 403 &&
    (e.errorCode === 'missing_permission' ||
      e.errorCode === 'forbidden_role' ||
      e.errorCode === null)
  );
}

/** The account was deactivated mid-session. Terminal — sign out, don't banner. */
export function isAccountInactive(err: unknown): boolean {
  return err instanceof ApiError && err.errorCode === 'account_inactive';
}

/** A compare-and-swap lost its race. The server's message is written for the user. */
export function isConflict(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409;
}

export function isNetworkError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 0;
}
