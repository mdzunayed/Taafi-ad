/**
 * Cookie names, split out from `lib/auth/cookies.ts` so `middleware.ts` can
 * import them without dragging `server-only` into the Edge bundle.
 *
 * The write-side helpers (and the flag choices behind them) live in
 * `lib/auth/cookies.ts`.
 */
export const COOKIE = {
  access: 'taafi_at',
  refresh: 'taafi_rt',
  session: 'taafi_session',
} as const;
