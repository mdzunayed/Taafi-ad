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

/**
 * Accepted spellings, highest precedence first.
 *
 * `NEXT_PUBLIC_API_URL` / `API_URL` are aliases, honoured because they are the
 * names people reach for by default — and because getting this wrong is
 * SILENT. Next.js does not warn about an env var nothing reads: you set
 * `NEXT_PUBLIC_API_URL`, restart, see the value in `.env.local`, and the app
 * carries on talking to whatever the real variable said. Accepting both costs
 * two lines and removes a debugging session.
 *
 * Either spelling takes an origin with or without an `/api` or `/api/vN`
 * suffix — `deriveOrigin` strips it — so all four of these are equivalent:
 *
 *   NEXT_PUBLIC_API_BASE_URL=https://taafi-backend.onrender.com/api/v1
 *   NEXT_PUBLIC_API_BASE_URL=https://taafi-backend.onrender.com
 *   NEXT_PUBLIC_API_URL=https://taafi-backend.onrender.com/api/v1
 *   NEXT_PUBLIC_API_URL=https://taafi-backend.onrender.com
 *
 * Written as separate `process.env.X` member expressions on purpose: Next
 * inlines `NEXT_PUBLIC_*` into the client bundle by STATIC substitution, so a
 * computed lookup (`process.env[name]`) would compile to `undefined` in the
 * browser and only fail there.
 */
const RAW_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:5000/api/v1';

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
 *
 * `API_URL` is accepted as an alias for `API_ORIGIN`, for the same reason as
 * above. Both are server-only — no `NEXT_PUBLIC_` prefix — so neither reaches
 * the browser bundle.
 */
export const SERVER_API_ORIGIN =
  process.env.API_ORIGIN?.replace(/\/$/, '') ||
  process.env.API_URL?.replace(/\/$/, '') ||
  API_ORIGIN;

export const IS_PROD = process.env.NODE_ENV === 'production';

if (!API_ORIGIN) {
  throw new Error(
    'NEXT_PUBLIC_API_BASE_URL (or NEXT_PUBLIC_API_URL) is empty or ' +
      'unparseable. Expected something like ' +
      'https://taafi-backend.onrender.com/api/v1 — see .env.example.',
  );
}
