import { API_ORIGIN } from '@/lib/config/env';

export { API_ORIGIN };

/**
 * Per-domain path prefixes.
 *
 * The backend mounts its routers inconsistently (see `backend/src/server.js`):
 *
 *   auth      →  /auth, /api/auth, /api/v1/auth
 *   admin     →  /admin, /api/admin, /api/v1/admin
 *   provider  →  /provider, /api/provider, /api/v1/provider
 *   EVERYTHING ELSE → /api/<name> only, with NO /api/v1 alias
 *
 * That last line is the trap. `GET /api/v1/promo-banners` is a 404 — a 404
 * that reads exactly like "this banner doesn't exist". Always compose a URL
 * from one of these constants; never string-concatenate onto the raw
 * `NEXT_PUBLIC_API_BASE_URL`.
 */
export const P = {
  auth: '/api/v1/auth',
  admin: '/api/v1/admin',
  /** CMS + config routers. `/api` ONLY — there is no v1 alias. */
  content: '/api',
  /** Presigned document grants. `/api` only; the token is the credential. */
  docs: '/api/documents',
} as const;

/** Absolute URL for a path, for the rare case something needs one (img/iframe). */
export function absolute(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}
