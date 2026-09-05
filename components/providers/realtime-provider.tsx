'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import {
  getSocket,
  disposeSocket,
  isSocketConnected,
  subscribeToConnection,
} from '@/lib/realtime/socket';
import { startChime, stopChime, unlockAudio, isUnlocked } from '@/lib/realtime/chime';
import {
  permissionState,
  permissionServerSnapshot,
  requestPermission,
  showRequestNotification,
  subscribeToPermission,
  type NotificationPermissionState,
} from '@/lib/realtime/desktop-notification';
import { qk } from '@/lib/api/query-keys';
import {
  REALTIME_EVENTS,
  type NewCareRequestEvent,
} from '@/types/wire/realtime';

interface RealtimeContextValue {
  /** Requests that have arrived and not yet been opened or dismissed. */
  pending: NewCareRequestEvent[];
  connected: boolean;
  /** True when the browser is refusing to play the chime. */
  soundBlocked: boolean;
  notificationPermission: NotificationPermissionState;
  /** Dismiss one alert. Silences the chime when it was the last. */
  acknowledge: (requestId: string) => void;
  acknowledgeAll: () => void;
  /** Open the booking and acknowledge in one step. */
  open: (event: NewCareRequestEvent) => void;
  /** Must be called from a click — grants sound and desktop notifications. */
  enableAlerts: () => Promise<void>;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

/**
 * Live dispatch alerts for the console.
 *
 * Mounted once, inside the dashboard shell, so the socket's lifetime matches
 * the signed-in session rather than any one screen. An operator on the Finance
 * tab still hears a new request land.
 *
 * ## What it does
 *
 * 1. Subscribes to `room:admins` (joined server-side from the JWT role) and
 *    listens for `new_care_request`.
 * 2. Chimes on a loop and raises a desktop notification until acknowledged.
 * 3. Invalidates the affected React Query caches so the list under the banner
 *    is already correct when the operator clicks through.
 *
 * ## Why the payload is a trigger, not a source of truth
 *
 * Every handler here refetches rather than merging the event into the cache.
 * Socket delivery is at-most-once with no ordering guarantee across a
 * reconnect, so a cache built from events drifts from the database in exactly
 * the situation — a flaky connection — where an operator is least likely to
 * notice. The event says "something changed"; REST says what.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [pending, setPending] = useState<NewCareRequestEvent[]>([]);
  const [soundBlocked, setSoundBlocked] = useState(false);

  // Both of these are browser state, not React state — the socket owns its
  // connection and the browser owns the permission grant. Subscribing rather
  // than mirroring into `useState` avoids the cascading render (and, for the
  // permission, the SSR hydration mismatch) that copying them would cause.
  const connected = useSyncExternalStore(
    subscribeToConnection,
    isSocketConnected,
    () => false,
  );
  const notificationPermission = useSyncExternalStore<NotificationPermissionState>(
    subscribeToPermission,
    permissionState,
    permissionServerSnapshot,
  );

  // Live notifications, closed on acknowledge so dismissing in-page also
  // clears the OS-level toast.
  const desktopToasts = useRef(new Map<string, Notification>());

  const refreshBookingViews = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: qk.bookings });
    void queryClient.invalidateQueries({ queryKey: qk.stats });
    void queryClient.invalidateQueries({ queryKey: qk.activity });
    void queryClient.invalidateQueries({ queryKey: qk.liveServices });
  }, [queryClient]);

  // `prescription:paid` is the queue-changed signal. Its name is historical —
  // it fired only at settlement back when review was gated on payment. It now
  // also fires when a doctor submits or resubmits a draft, which is the event
  // an operator sitting on the Rx queue actually needs. It used to invalidate
  // the booking views (which it has nothing to do with) and not the queue.
  const refreshRxQueue = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
    void queryClient.invalidateQueries({ queryKey: qk.bookings });
  }, [queryClient]);

  useEffect(() => {
    const socket = getSocket();

    // A reconnect means we were deaf for some interval. Anything that changed
    // in the gap arrived as an event nobody heard, so treat the reconnect
    // itself as an invalidation. (The connected FLAG is handled by the
    // subscription above; this listener is only about refetching.)
    function onConnect() {
      refreshBookingViews();
    }

    function onNewRequest(event: NewCareRequestEvent) {
      if (!event?.requestId) return;

      setPending((current) => {
        // A reconnect can redeliver, and StrictMode double-mounts in dev.
        // Dedupe on id so neither produces two banners for one patient.
        if (current.some((e) => e.requestId === event.requestId)) return current;
        return [event, ...current];
      });

      startChime(() => setSoundBlocked(true));

      const toast = showRequestNotification({
        requestId: event.requestId,
        title: `New ${event.careType || 'care'} request`,
        body:
          `${event.patientName || 'A patient'}` +
          (event.locationText ? ` — ${event.locationText}` : '') +
          '. Click to open and set the fee.',
        onClick: () => router.push(event.deepLink),
      });
      if (toast) desktopToasts.current.set(event.requestId, toast);

      refreshBookingViews();
    }

    socket.on('connect', onConnect);
    socket.on(REALTIME_EVENTS.newCareRequest, onNewRequest);

    // The pre-existing admin broadcasts. They predate this provider and had no
    // listener at all, which is why the console needed a manual refresh to see
    // a cancellation or a cleared payment.
    socket.on(REALTIME_EVENTS.cancelled, refreshBookingViews);
    socket.on(REALTIME_EVENTS.paymentUpdated, refreshBookingViews);
    socket.on(REALTIME_EVENTS.prescriptionPaid, refreshRxQueue);

    const refreshPayouts = () => {
      void queryClient.invalidateQueries({ queryKey: ['finance'] });
    };
    socket.on(REALTIME_EVENTS.payoutRequested, refreshPayouts);
    socket.on(REALTIME_EVENTS.payoutResolved, refreshPayouts);

    return () => {
      socket.off('connect', onConnect);
      socket.off(REALTIME_EVENTS.newCareRequest, onNewRequest);
      socket.off(REALTIME_EVENTS.cancelled, refreshBookingViews);
      socket.off(REALTIME_EVENTS.paymentUpdated, refreshBookingViews);
      socket.off(REALTIME_EVENTS.prescriptionPaid, refreshRxQueue);
      socket.off(REALTIME_EVENTS.payoutRequested, refreshPayouts);
      socket.off(REALTIME_EVENTS.payoutResolved, refreshPayouts);
      // Listeners are detached but the socket stays up: this effect re-runs on
      // router/queryClient identity changes, and tearing down the connection
      // there would reconnect-storm the backend. `disposeSocket` belongs to
      // sign-out.
    };
  }, [router, queryClient, refreshBookingViews, refreshRxQueue]);

  // Sign-out happens by full navigation (`window.location.replace`), which
  // drops the socket with the document. This covers the tab-close path so the
  // server sees a clean disconnect rather than a heartbeat timeout.
  useEffect(() => {
    const onUnload = () => disposeSocket();
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, []);

  // The chime is bound to "is anything still unacknowledged", not to the
  // arrival event — so it keeps sounding through a page navigation and stops
  // the instant the queue empties, with no per-callback bookkeeping.
  useEffect(() => {
    if (pending.length === 0) stopChime();
  }, [pending.length]);

  const acknowledge = useCallback((requestId: string) => {
    setPending((current) => current.filter((e) => e.requestId !== requestId));
    const toast = desktopToasts.current.get(requestId);
    if (toast) {
      toast.close();
      desktopToasts.current.delete(requestId);
    }
  }, []);

  const acknowledgeAll = useCallback(() => {
    setPending([]);
    desktopToasts.current.forEach((t) => t.close());
    desktopToasts.current.clear();
  }, []);

  const open = useCallback(
    (event: NewCareRequestEvent) => {
      acknowledge(event.requestId);
      router.push(event.deepLink);
    },
    [acknowledge, router],
  );

  const enableAlerts = useCallback(async () => {
    const ok = await unlockAudio();
    setSoundBlocked(!ok);
    // Both grants come off the same click. Asking for notifications here — and
    // only here — is what keeps us out of the sticky `denied` state.
    // `requestPermission` notifies its own subscribers, so there is no
    // permission state to set here.
    await requestPermission();
    // If a request is already waiting, start the chime the operator just
    // authorised rather than making them wait for the next one.
    if (ok && pending.length > 0) startChime(() => setSoundBlocked(true));
  }, [pending.length]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      pending,
      connected,
      soundBlocked,
      notificationPermission,
      acknowledge,
      acknowledgeAll,
      open,
      enableAlerts,
    }),
    [
      pending,
      connected,
      soundBlocked,
      notificationPermission,
      acknowledge,
      acknowledgeAll,
      open,
      enableAlerts,
    ],
  );

  return (
    <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error('useRealtime must be used inside the dashboard layout.');
  }
  return ctx;
}

export { isUnlocked };
