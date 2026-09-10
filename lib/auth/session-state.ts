'use client';

/**
 * The terminal "this session is over" latch.
 *
 * WHY THIS EXISTS: `endSession()` calls `window.location.replace('/login')`,
 * and that navigation is SCHEDULED, not immediate. The document keeps running
 * — and keeps its timers — until the browser actually tears it down. On this
 * portal that window is not a few milliseconds: the API client budgets 60s for
 * a Render cold start, so a sign-out that happens while the backend is waking
 * leaves the dashboard alive and polling for a long time.
 *
 * Without a latch, every one of those in-flight ticks does the full round
 * trip again. Worse, `clearToken()` has just nulled the in-memory token, so
 * the request interceptor's `getAccessToken()` re-bootstraps from
 * `/api/auth/session`, gets the still-present (but upstream-expired) cookie
 * back, retries, and earns another 401 — which calls `endSession()` again.
 * Three overview queries on a 30s interval turn that into the repeating
 * 401 storm in the console, all of it after the user is already signed out.
 *
 * So: once this latch is set, nothing may touch the network again. The
 * request interceptor rejects locally, the token bootstrap stops, and the
 * polling call sites drop their timers.
 *
 * DELIBERATELY IMPORT-FREE. `refresh.ts`, `token-store.ts` and `lib/api/http.ts`
 * all need this, and those three already import each other — putting the latch
 * in any of them makes a cycle.
 *
 * Per-document by design. It is not persisted and not read back on load: a
 * fresh document after the redirect starts with a clean latch, which is what
 * lets a user sign straight back in.
 */
let over = false;

type Listener = () => void;
const listeners = new Set<Listener>();

/** True once the session has ended terminally in this document. */
export function isSessionOver(): boolean {
  return over;
}

/**
 * Latch the session closed and notify subscribers. Idempotent — the first
 * caller wins and every later one is a no-op, which is what keeps three
 * simultaneous 401s from broadcasting three sign-outs.
 *
 * Returns true only for the caller that actually flipped it, so `endSession`
 * can do its one-time work (broadcast, navigate) inside that branch.
 */
export function markSessionOver(): boolean {
  if (over) return false;
  over = true;
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // A listener that throws must not stop the others from tearing down.
    }
  }
  return true;
}

/**
 * Subscribe to the latch. Fires immediately if it is already set, so a
 * component that mounts mid-teardown is not left polling. Returns an
 * unsubscribe suitable for returning straight out of a `useEffect`.
 */
export function onSessionOver(fn: Listener): () => void {
  if (over) {
    fn();
    return () => {};
  }
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * `refetchInterval` for a polled query, as a FUNCTION rather than a number.
 *
 * React Query re-evaluates this after every settle, so the tick that lands on
 * the closed latch is the last one — the timer is dropped rather than
 * rescheduled. A plain `refetchInterval: 30_000` keeps firing until the
 * document dies.
 */
export function pollWhileSignedIn(ms: number): () => number | false {
  return () => (over ? false : ms);
}
