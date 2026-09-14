import { API_ORIGIN } from '@/lib/config/env';

/** Paths only the API serves: presigned grants and the upload mount. */
const API_PATH = /^\/(api|uploads)\//;

/** Hosts that only resolve on the machine that minted the URL. */
const LOOPBACK_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)$/i;

const ABSOLUTE_HTTP = /^https?:\/\//i;
const EMBEDDED_HTTP = /https?:\/\//i;

/** `[label](target)` or a bare `[label]` at the start of a value. */
const MARKDOWN_LINK = /^\[([^\]]*)\](?:\(([^)\s]*)\))?/;

function hostOf(value: string): { origin: string; hostname: string } | null {
  try {
    const { origin, hostname } = new URL(value);
    return { origin, hostname };
  } catch {
    return null;
  }
}

/**
 * Undo the copy-paste damage a URL picks up before it reaches this console —
 * the same repairs as the API's `repairUrlText` (backend/src/utils/publicUrl.js),
 * so a grant minted before that shipped still opens.
 *
 *   • `[https://api](https://api)/api/documents/t` — PUBLIC_BASE_URL pasted
 *     from something that rendered it as a link. `new URL` resolves that as a
 *     RELATIVE path under {@link API_ORIGIN}, so without this it is fetched
 *     from `…/[https:/api](https:/api)/api/documents/t` and 404s.
 *   • `<…>`, quotes and backticks left by the same copy.
 *   • `https://apihttps://api/uploads/a.jpg` — an absolute URL joined onto a
 *     base again. Collapsed only when the outer host is the same one or
 *     loopback, never a different real host: that would move the request.
 */
export function repairUrlText(raw: string): string {
  let value = raw.trim().replace(/^[<"'`]+|[>"'`]+$/g, '').trim();

  const link = value.match(MARKDOWN_LINK);
  if (link) {
    const [whole, label, target] = link;
    if (target || ABSOLUTE_HTTP.test(label)) {
      value = (target || label).trim() + value.slice(whole.length);
    }
  }

  // Before `?`/`#` only — a query string may legitimately carry a URL.
  while (ABSOLUTE_HTTP.test(value)) {
    const end = value.search(/[?#]/);
    const head = end === -1 ? value : value.slice(0, end);
    const nested = head.slice(1).search(EMBEDDED_HTTP);
    if (nested === -1) break;
    const outer = hostOf(value.slice(0, nested + 1));
    const inner = hostOf(value.slice(nested + 1));
    if (!inner || !outer) break;
    if (outer.origin !== inner.origin && !LOOPBACK_HOST.test(outer.hostname)) break;
    value = value.slice(nested + 1);
  }
  return value;
}

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
 * Copy-paste damage is repaired first — see {@link repairUrlText}.
 *
 * Everything else passes through untouched: Cloudinary URLs, `blob:` and
 * `data:` previews, and any path the API does not serve. Any OTHER scheme
 * comes back as `''`: this value is an `<iframe src>`, which runs a
 * `javascript:` URL, and the markdown repair above is exactly what would turn
 * an inert `[x](javascript:…)` into one.
 */
export function resolveDocumentUrl(raw: string | null | undefined): string {
  const value = repairUrlText(raw ?? '');
  if (!value) return '';

  let url: URL;
  try {
    url = new URL(value, API_ORIGIN);
  } catch {
    return value;
  }
  if (url.protocol === 'blob:' || url.protocol === 'data:') return value;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
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
