'use client';

import { io, type Socket } from 'socket.io-client';

import { API_ORIGIN } from '@/lib/config/env';
import { getAccessToken } from '@/lib/auth/token-store';

/**
 * The console's one Socket.io connection.
 *
 * Everything else in this app is request/response through axios. This is the
 * exception, and it exists for one reason: a new care request has to reach a
 * human in the room within seconds, and polling a list endpoint on a timer is
 * both louder on the API and slower at the only moment that matters.
 *
 * ## Why a module singleton and not a hook
 *
 * The backend counts sockets. A provider's `duty_status` is flipped ONLINE on
 * connect and OFFLINE on disconnect (server.js), and although back-office roles
 * don't participate in that, the same handler runs. A connection created per
 * component — or worse, per React StrictMode double-mount — produces connect /
 * disconnect churn on every navigation. One socket per tab, created lazily,
 * disposed on sign-out.
 *
 * ## Auth
 *
 * The JWT rides in the handshake (`auth.token`), which is what the server's
 * `io.use()` middleware reads. That token expires. `socket.io-client` will
 * happily reconnect forever with the ORIGINAL handshake payload, so a socket
 * that drops after the access token rotates would reconnect with a dead token
 * and be rejected as `unauthorized` — permanently silent, with no visible
 * error. `auth` is therefore a CALLBACK: socket.io re-invokes it before every
 * reconnect attempt, so each one carries whatever token is current.
 *
 * @see lib/auth/token-store.ts for why the token lives in memory
 */

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;

  socket = io(API_ORIGIN, {
    // Re-read on every (re)connect — see the auth note above.
    auth: (cb) => {
      void getAccessToken().then((token) => cb({ token: token ?? undefined }));
    },
    // Long-poll fallback stays enabled: the office sits behind proxies that
    // occasionally break WebSocket upgrades, and a degraded alert beats none.
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1_000,
    // Capped so a backend restart during a night shift doesn't back off into
    // minutes of silence.
    reconnectionDelayMax: 10_000,
    // The default (Infinity) is what we want: this console is left open for a
    // whole shift and must recover from any outage without a reload.
    reconnectionAttempts: Infinity,
    // Nothing here is authoritative — every payload is a nudge to refetch — so
    // there is no value in replaying a queue built up while disconnected.
    // Fresh state comes from the invalidation that follows reconnect.
    autoConnect: true,
  });

  return socket;
}

/**
 * Connection state WITHOUT creating a socket.
 *
 * Split from `getSocket()` so it is safe to call during render as a
 * `useSyncExternalStore` snapshot — a snapshot that constructed the socket as
 * a side effect would fire on the server too, and connect from a render pass.
 */
export function isSocketConnected(): boolean {
  return socket?.connected ?? false;
}

/** Subscribe to connect/disconnect. Runs post-mount, so creating here is safe. */
export function subscribeToConnection(onChange: () => void): () => void {
  const s = getSocket();
  s.on('connect', onChange);
  s.on('disconnect', onChange);
  return () => {
    s.off('connect', onChange);
    s.off('disconnect', onChange);
  };
}

/** Tear down on sign-out so the next user's tab doesn't inherit this stream. */
export function disposeSocket(): void {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}
