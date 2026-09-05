import 'server-only';

/**
 * CSRF guard for our own POST route handlers.
 *
 * The API itself has no cookie surface, so the only cross-site-forgeable
 * endpoints in this system are the three handlers under /api/auth. SameSite
 * already blocks the common cases; this is the belt to that suspenders, and
 * it costs one header read.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  // Same-origin fetches from our own client always send Origin on POST.
  // A missing Origin means a non-browser client (curl, a health check), which
  // cannot be a cross-site forgery — there is no ambient cookie to ride.
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export function forbiddenOrigin(): Response {
  return Response.json(
    { success: false, message: 'Cross-origin request rejected.' },
    { status: 403 },
  );
}
