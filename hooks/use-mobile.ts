import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/**
 * Tracks the mobile breakpoint for the sidebar's drawer/rail switch.
 *
 * `useSyncExternalStore` rather than the state-plus-effect shape shadcn ships:
 * a media query is an external store, and subscribing to one properly avoids
 * the cascading re-render that setState-inside-an-effect causes. The server
 * snapshot is `false` so the desktop layout is what gets prerendered.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
