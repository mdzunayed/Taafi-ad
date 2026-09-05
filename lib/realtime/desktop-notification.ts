'use client';

/**
 * Browser desktop notifications for incoming care requests.
 *
 * The chime tells an operator who is AT the console. This is for the one who
 * has tabbed away to a spreadsheet — the notification surfaces over whatever
 * they're in, and clicking it focuses the tab on the booking.
 *
 * Permission is never requested on page load. An unprompted permission dialog
 * is the thing users reflexively deny, and `denied` is sticky — it cannot be
 * re-requested from script, so one bad prompt permanently disables desktop
 * alerts for that operator. We ask only from an explicit click on the alert
 * banner's "Enable alerts" control, where the user already knows what they're
 * being asked for.
 */

export type NotificationPermissionState =
  | 'unsupported'
  | 'default'
  | 'granted'
  | 'denied';

export function permissionState(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as NotificationPermissionState;
}

/**
 * `Notification.permission` is a browser global with no change event, so it is
 * an external store React has to be told about. These three make it readable
 * through `useSyncExternalStore`, which is what keeps the permission out of
 * component state — reading it into `useState` inside a mount effect would
 * either render the wrong value during SSR (where `Notification` does not
 * exist) or trip a hydration mismatch.
 */
const listeners = new Set<() => void>();

export function subscribeToPermission(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** The SSR snapshot. No `Notification` on the server, by definition. */
export function permissionServerSnapshot(): NotificationPermissionState {
  return 'unsupported';
}

/** Ask for permission. Call ONLY from a user-gesture handler — see above. */
export async function requestPermission(): Promise<NotificationPermissionState> {
  if (permissionState() === 'unsupported') return 'unsupported';
  try {
    const result =
      (await Notification.requestPermission()) as NotificationPermissionState;
    // Nothing else observes this global, so the store has to announce itself.
    listeners.forEach((l) => l());
    return result;
  } catch {
    return permissionState();
  }
}

export function showRequestNotification(opts: {
  requestId: string;
  title: string;
  body: string;
  onClick: () => void;
}): Notification | null {
  if (permissionState() !== 'granted') return null;
  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      // Tagged by request id so a reconnect that replays the same event
      // replaces the existing toast instead of stacking a duplicate.
      tag: `care-request-${opts.requestId}`,
      // Survives until dismissed. A care request that auto-hid after four
      // seconds while the operator was in another window would defeat the
      // point of sending it.
      requireInteraction: true,
    });
    n.onclick = () => {
      window.focus();
      opts.onClick();
      n.close();
    };
    return n;
  } catch {
    // Some browsers throw on `new Notification` outside a service worker.
    // The in-page banner and the chime still cover it.
    return null;
  }
}
