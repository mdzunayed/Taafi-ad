import { API_ORIGIN } from '@/lib/config/env';

/** Paths only the API serves: presigned grants and the upload mount. */
const API_PATH = /^\/(api|uploads)\//;

/** Hosts that only resolve on the machine that minted the URL. */
const LOOPBACK_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)$/i;

/**
 * A document URL the browser can actually fetch, rebased onto {@link API_ORIGIN}
 * when the server addressed it to the wrong host.
 *
 * The API mints every grant and upload URL off its own `PUBLIC_BASE_URL`, and
 * that value has been wrong in both of the ways this repairs:
 *
 *   • loopback (`http://localhost:5000/...`) — rows and grants from a server
 *     that ran with it unset. Unreachable from any other machine.
 *   • this console's own origin — production once ran with
 *     `PUBLIC_BASE_URL=https://taafi-ad.vercel.app` (see
 *     backend/src/services/publicUrlProbe.js). Vercel answers 404 for
 *     `/api/documents/...`, which the preview reports as "This file could not
 *     be displayed" while the bytes sit intact on the API.
 *
 * A grant's token carries its own authority and names no host, so moving it to
 * the right origin is safe. Relative API paths are absolutized the same way.
 *
 * Everything else passes through untouched: Cloudinary URLs, `blob:` and
 * `data:` previews, and any path the API does not serve.
 */
export function resolveDocumentUrl(raw: string | null | undefined): string {
  const value = raw?.trim() ?? '';
  if (!value) return '';

  let url: URL;
  try {
    url = new URL(value, API_ORIGIN);
  } catch {
    return value;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return value;
  if (!API_PATH.test(url.pathname)) return value;

  const relative = value.startsWith('/') && !value.startsWith('//');
  const misaddressed =
    LOOPBACK_HOST.test(url.hostname) ||
    // Client-only: grants arrive through react-query after mount, so the
    // server render never holds one and cannot disagree with this branch.
    (typeof window !== 'undefined' && url.origin === window.location.origin);

  if (!relative && (!misaddressed || url.origin === API_ORIGIN)) return value;
  return `${API_ORIGIN}${url.pathname}${url.search}${url.hash}`;
}
