import type { AxiosResponse } from 'axios';

/**
 * Envelope unwrapping — explicit per endpoint, never heuristic.
 *
 * The backend returns six different shapes:
 *
 *   bare array          /admin/requests, /patients, /providers, /billing,
 *                       /activity, /live-services,
 *                       /requests/:id/{doctors,nurses,helpers,team-pool},
 *                       and every CMS `GET /`
 *   flat object         /admin/stats, /admin/chart-data
 *   {success, <key>}    settings, qualifications, prescriptions, finance,
 *                       patient detail, most provider mutations
 *   {success, items, …} /admin/audit-logs — the ONLY paginated endpoint
 *   {ok: true}          CMS deletes
 *   bare document       GET /admin/bookings/:id, PATCH .../set-deposit
 *
 * A generic "if data.items use it, else if it's an array use it" unwrapper
 * looks tempting and destroys information: `/finance/payouts` returns
 * `{items, pendingCount, pendingTotal}` and the header cards need those two
 * rollups; `/finance/cash-in-hand` has no `items` key at all. So each
 * endpoint function names its own shape. It is roughly forty tiny functions
 * and it is the right amount of ceremony.
 */

export interface Paged<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

/** Loud failure beats a silently empty table when a shape drifts. */
function assertArray(value: unknown, endpoint: string): unknown[] {
  if (Array.isArray(value)) return value;
  throw new Error(
    `Expected an array from ${endpoint} but received ${typeof value}. ` +
      'The endpoint contract changed — check backend/src/routes/admin.js.',
  );
}

/** Endpoints that answer with a bare, unwrapped array. */
export function unwrapArray<T>(res: AxiosResponse, endpoint: string): T[] {
  return assertArray(res.data, endpoint) as T[];
}

/** `{success: true, <key>: T}` */
export function unwrapField<T>(res: AxiosResponse, key: string): T {
  const data = res.data as Record<string, unknown> | null;
  return (data?.[key] ?? null) as T;
}

/** `{success: true, <key>: T[]}` — missing key reads as empty, not a crash. */
export function unwrapFieldArray<T>(res: AxiosResponse, key: string): T[] {
  const data = res.data as Record<string, unknown> | null;
  const value = data?.[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

/** A flat object with no `success` wrapper, e.g. `/admin/stats`. */
export function unwrapFlat<T>(res: AxiosResponse): T {
  return res.data as T;
}

/** `/admin/audit-logs` only. Note the snake_case `has_more` on the wire. */
export function unwrapPaged<T>(res: AxiosResponse): Paged<T> {
  const data = res.data as {
    items?: T[];
    page?: number;
    limit?: number;
    total?: number;
    has_more?: boolean;
  };
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    page: data?.page ?? 1,
    limit: data?.limit ?? 50,
    total: data?.total ?? 0,
    hasMore: data?.has_more ?? false,
  };
}

/**
 * Server-side row caps, surfaced so lists can say so.
 *
 * These endpoints silently truncate. Rendering 500 rows as though they were
 * the whole set is a correctness bug on a billing report, not a UX nit.
 */
export const ROW_CAPS = {
  patients: 500,
  providers: 500,
  billing: 500,
  payouts: 200,
  liveServices: 200,
  activity: 8,
} as const;
