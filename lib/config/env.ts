/**
 * Environment resolution, in one place so a misconfigured deploy fails loudly
 * at import time rather than as a 404 that looks like a missing record.
 */

/**
 * The API origin, with any `/api` or `/api/vN` suffix stripped.
 *
 * `NEXT_PUBLIC_API_BASE_URL` is named as though it were a complete base for
 * every call, but it is not: the backend aliases `/api/v1` over only three
 * routers (auth, admin, provider). The content CMS and the document-grant
 * endpoint answer at `/api/*` and nowhere else. So we keep the familiar env
 * var, take the origin out of it, and let `lib/api/paths.ts` own the prefixes.
 *
 * @see lib/api/paths.ts
 */
function deriveOrigin(raw: string): string {
  return raw.replace(/\/api(\/v\d+)?\/?$/, '').replace(/\/$/, '');
}

const RAW_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:5000/api/v1';

/** Browser-side origin, e.g. `http://localhost:5000`. */
export const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/$/, '') ||
  deriveOrigin(RAW_BASE);

/**
 * Server-side origin used by the BFF route handlers.
 *
 * Split from {@link API_ORIGIN} so a deployment can route server-to-server
 * traffic over a private network address while the browser keeps using the
 * public one. Falls back to the public origin when unset.
 */
export const SERVER_API_ORIGIN =
  process.env.API_ORIGIN?.replace(/\/$/, '') || API_ORIGIN;

export const IS_PROD = process.env.NODE_ENV === 'production';

if (!API_ORIGIN) {
  throw new Error(
    'NEXT_PUBLIC_API_BASE_URL is empty or unparseable. Expected something ' +
      'like http://localhost:5000/api/v1 — see .env.example.',
  );
}
