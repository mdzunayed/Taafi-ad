/**
 * JWT payload decoding, usable from the browser, a route handler, or proxy.ts.
 *
 * DECODE ONLY — there is no signature verification here and callers must not
 * assume one. We deliberately do not hold `JWT_SECRET` in this app: copying
 * the platform's signing key into a second deployment widens the blast radius
 * of any compromise here, and buys nothing, because Express verifies every
 * request that carries real data.
 *
 * Concretely: anyone can hand-craft a cookie containing
 * `{"role":"super_admin","exp":9999999999}` and walk past every check built on
 * this module. What they get is an empty shell.
 *
 * The rule that follows: never render anything sensitive out of a decoded
 * payload, and never treat it as authorization. It decides routing and nav
 * shape, nothing else.
 *
 * `atob` is used rather than `Buffer` so this module stays usable in the
 * browser bundle as well as on the server.
 */

export interface JwtPayload {
  sub?: string;
  role?: string;
  iat?: number;
  /** Seconds since epoch, per the JWT spec. */
  exp?: number;
}

function base64UrlDecode(segment: string): string {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  // atob exists in both the Edge runtime and the browser.
  return atob(padded + pad);
}

/** Returns the payload, or null if the token is malformed. Never throws. */
export function decodeJwt(token: string | undefined | null): JwtPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(base64UrlDecode(parts[1])) as JwtPayload;
  } catch {
    return null;
  }
}

/** Access-token expiry in epoch **milliseconds**, or null when absent. */
export function expiryMs(token: string | undefined | null): number | null {
  const exp = decodeJwt(token)?.exp;
  return typeof exp === 'number' ? exp * 1000 : null;
}

/** True when the token is missing, unparseable, or past its `exp`. */
export function isExpired(token: string | undefined | null, skewMs = 0): boolean {
  const ms = expiryMs(token);
  if (ms === null) return true;
  return Date.now() + skewMs >= ms;
}
