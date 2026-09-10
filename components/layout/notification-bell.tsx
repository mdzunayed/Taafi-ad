'use client';

import { Bell, BellRing, Clock, VolumeX } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRealtime } from '@/components/providers/realtime-provider';
import { relativeTime } from '@/lib/format';

/**
 * The unacknowledged-request counter in the header.
 *
 * It reads the SAME queue as `<IncomingRequestAlert>` — one socket, one
 * `pending` array — rather than opening a second channel, so the two can never
 * disagree about how many patients are waiting.
 *
 * Why it exists at all, given the alert stack already interrupts: the alert
 * stack is pinned to the top of the viewport, and on a phone that is exactly
 * where the operator's thumb dismisses things. Once an alert is dismissed the
 * request is still open, and until now nothing anywhere carried that fact.
 * The bell is the persistent copy — it is the thing an operator can come back
 * to after a phone call.
 *
 * Nothing renders at zero except the bell itself. A badge that reads "0" is
 * noise, and an operator who learns to ignore the number stops reading it when
 * it matters.
 */
export function NotificationBell() {
  const { pending, open, acknowledgeAll, soundBlocked, enableAlerts } =
    useRealtime();

  const count = pending.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-9 md:size-8"
          aria-label={
            count === 0
              ? 'No new care requests'
              : `${count} new care request${count === 1 ? '' : 's'}`
          }
        >
          {count > 0 ? (
            <BellRing className="text-destructive size-4 animate-pulse" />
          ) : (
            <Bell className="size-4" />
          )}
          {count > 0 && (
            <span
              className="bg-destructive absolute text-white -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold tabular-nums"
              aria-hidden
            >
              {count > 9 ? '9+' : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      {/*
        `w-(--radix-dropdown-menu-trigger-width)` is the primitive's default and
        would size this panel to the 36px icon button that opened it. The width
        is pinned instead, and capped against the viewport so it cannot push a
        320px screen sideways.
      */}
      <DropdownMenuContent
        align="end"
        className="w-[min(20rem,calc(100vw-1.5rem))]"
      >
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Incoming requests</span>
          {count > 0 && (
            <button
              type="button"
              onClick={acknowledgeAll}
              className="hover:text-foreground text-xs font-normal underline-offset-2 hover:underline"
            >
              Dismiss all
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {soundBlocked && (
          <>
            <DropdownMenuItem
              className="py-2"
              onSelect={(e) => {
                // `enableAlerts` must run from the click that opened it — the
                // browser only grants audio inside a user gesture, and letting
                // the menu close first loses that gesture.
                e.preventDefault();
                void enableAlerts();
              }}
            >
              <VolumeX className="text-destructive" />
              <span className="text-xs">
                The chime is muted. Tap to enable sound and alerts.
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {count === 0 ? (
          <p className="text-muted-foreground px-1.5 py-3 text-center text-xs">
            Nothing waiting. New care requests land here the moment they are
            submitted.
          </p>
        ) : (
          pending.map((event) => (
            <DropdownMenuItem
              key={event.requestId}
              className="flex-col items-start gap-1 py-2"
              onSelect={() => open(event)}
            >
              <div className="flex w-full items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {event.patientName || 'Unknown patient'}
                </span>
                {event.urgencyLevel && event.urgencyLevel !== 'medium' && (
                  <Badge
                    variant={
                      event.urgencyLevel === 'critical' ||
                      event.urgencyLevel === 'high'
                        ? 'destructive'
                        : 'secondary'
                    }
                    className="shrink-0"
                  >
                    {event.urgencyLevel}
                  </Badge>
                )}
              </div>
              <span className="text-muted-foreground w-full truncate text-xs">
                {event.careType || 'Care request'}
                {event.locationText ? ` · ${event.locationText}` : ''}
              </span>
              <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                <Clock className="size-3" />
                {relativeTime(event.createdAt)}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
