'use client';

import { BellRing, MapPin, Phone, VolumeX, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRealtime } from '@/components/providers/realtime-provider';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The incoming-request alert stack.
 *
 * Pinned to the viewport, above everything, and deliberately NOT a toast:
 * `sonner` toasts auto-dismiss, and an alert that disappears on its own is
 * indistinguishable from one that was never seen. These persist until an
 * operator opens or dismisses them — the same condition that silences the
 * chime.
 *
 * Rendered for every back-office role. Triage is a support function as much as
 * an admin one, and the booking screen it links to does its own permission
 * gating, so there is nothing here to restrict.
 */
export function IncomingRequestAlert() {
  const {
    pending,
    soundBlocked,
    notificationPermission,
    acknowledge,
    acknowledgeAll,
    open,
    enableAlerts,
  } = useRealtime();

  // The permission prompt has to stay reachable BEFORE the first request
  // arrives — an operator discovering the sound is muted at the moment a
  // patient is waiting is exactly the failure this is meant to prevent.
  const needsPermission =
    soundBlocked || notificationPermission === 'default';

  if (pending.length === 0 && !needsPermission) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 px-4"
      // Assertive: this interrupts on purpose. A patient is waiting on a call.
      role="alert"
      aria-live="assertive"
    >
      {pending.length === 0 && needsPermission ? (
        <PermissionNudge
          soundBlocked={soundBlocked}
          permission={notificationPermission}
          onEnable={enableAlerts}
        />
      ) : null}

      {pending.map((event, index) => (
        <div
          key={event.requestId}
          className={cn(
            'pointer-events-auto w-full max-w-2xl rounded-lg border shadow-lg',
            'bg-card text-card-foreground',
            // The newest request is the one to act on; older ones recede
            // rather than competing for the same visual weight.
            index === 0
              ? 'border-destructive/60 ring-destructive/20 ring-2'
              : 'border-border opacity-90',
          )}
        >
          <div className="flex items-start gap-3 p-4">
            <span className="bg-destructive/10 text-destructive mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full">
              <BellRing className="size-4 animate-pulse" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">New care request</span>
                {event.urgencyLevel &&
                event.urgencyLevel !== 'medium' ? (
                  <Badge
                    variant={
                      event.urgencyLevel === 'critical' ||
                      event.urgencyLevel === 'high'
                        ? 'destructive'
                        : 'secondary'
                    }
                  >
                    {event.urgencyLevel}
                  </Badge>
                ) : null}
                <span className="text-muted-foreground text-xs">
                  {relativeTime(event.createdAt)}
                </span>
              </div>

              <div className="mt-1 truncate text-sm font-medium">
                {event.patientName || 'Unknown patient'}
                {event.careType ? (
                  <span className="text-muted-foreground font-normal">
                    {' — '}
                    {event.careType}
                  </span>
                ) : null}
              </div>

              <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                {event.patientPhone ? (
                  // The whole point of the alert is to start a phone call, so
                  // the number is dialable straight from the banner.
                  <a
                    href={`tel:${event.patientPhone}`}
                    className="hover:text-foreground inline-flex items-center gap-1 underline-offset-2 hover:underline"
                  >
                    <Phone className="size-3" />
                    {event.patientPhone}
                  </a>
                ) : null}
                {event.locationText ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" />
                    {event.locationText}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" onClick={() => open(event)}>
                Open
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Dismiss this alert"
                onClick={() => acknowledge(event.requestId)}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      ))}

      {pending.length > 1 ? (
        <Button
          size="sm"
          variant="secondary"
          className="pointer-events-auto"
          onClick={acknowledgeAll}
        >
          Dismiss all {pending.length}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Shown when the browser is blocking the chime or has not been asked about
 * desktop notifications. Both grants come from the one click — see
 * `enableAlerts`.
 */
function PermissionNudge({
  soundBlocked,
  permission,
  onEnable,
}: {
  soundBlocked: boolean;
  permission: string;
  onEnable: () => void;
}) {
  // `denied` cannot be undone from script — telling the operator to click a
  // button that provably cannot work would be worse than saying nothing.
  if (permission === 'denied' && !soundBlocked) return null;

  return (
    <div className="bg-card pointer-events-auto flex w-full max-w-2xl items-center gap-3 rounded-lg border p-3 shadow-sm">
      <VolumeX className="text-muted-foreground size-4 shrink-0" />
      <p className="text-muted-foreground min-w-0 flex-1 text-xs">
        {permission === 'denied'
          ? 'Sound is blocked for this tab. Click to enable the chime — desktop notifications stay blocked until you allow them in browser settings.'
          : 'Enable the alert chime and desktop notifications so new care requests reach you when this tab is in the background.'}
      </p>
      <Button size="sm" variant="outline" onClick={onEnable}>
        Enable alerts
      </Button>
    </div>
  );
}
