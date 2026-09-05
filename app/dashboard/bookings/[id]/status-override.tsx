'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DisabledWhenDenied } from '@/components/rbac/can';
import { overrideBookingStatus } from '@/lib/api/bookings';
import { qk } from '@/lib/api/query-keys';
import { normalizeError } from '@/lib/api/errors';
import {
  MILESTONES,
  TERMINAL_MILESTONES,
  TERMINAL_STATUSES,
  type BookingWire,
  type MilestoneKey,
} from '@/types/wire/booking';

/**
 * The operational status override — forcing a booking through its lifecycle
 * by hand.
 *
 * WHY THIS EXISTS. Every status this platform writes is normally written by
 * someone doing something: the provider taps "on my way", the patient pays,
 * the doctor closes the visit. When one of those taps does not happen — the
 * nurse forgot, the provider's app crashed at the door, a booking is wedged in
 * a state no actor can move it out of — the patient is left staring at a
 * tracker that says something untrue about their own care, and ops has no way
 * to correct it. This is that way.
 *
 * It is NOT a shortcut around dispatch or payment. Assigning a team and
 * confirming money have their own screens with their own side effects
 * (wallets, commissions, presigned documents); this route writes the status
 * and the tracker, and nothing else. Forcing SCHEDULED does not assign anyone.
 *
 * ## Milestones, not statuses
 *
 * The picker offers the six patient-facing steps plus CANCELLED, because that
 * is the vocabulary the operator and the patient are both looking at. The
 * canonical status the server will actually write is printed under each one,
 * so nobody has to guess what `CONFIRMED` lands on.
 *
 * ## One-way doors are marked as such
 *
 * `COMPLETED` and `CANCELLED` are terminal: the server's write is a
 * compare-and-swap guarded on the booking not already being closed, so once
 * either lands, no route in the system reopens it. The confirm step for those
 * two is deliberately heavier — a second click on a red button, not the same
 * "Apply" as moving a visit to EN_ROUTE.
 */
export function StatusOverrideDialog({
  booking,
  open,
  onOpenChange,
}: {
  booking: BookingWire;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<MilestoneKey | null>(null);
  const [note, setNote] = useState('');

  const current = booking.milestone as MilestoneKey | undefined;

  /**
   * A booking the server will refuse outright. Checked here so the operator
   * reads why rather than discovering it in a 409 toast — the same courtesy
   * the dispatch sheet extends for its own blockers.
   */
  const closed = (TERMINAL_STATUSES as readonly string[]).includes(booking.status);

  const chosen = useMemo(
    () => MILESTONES.find((m) => m.key === target) ?? null,
    [target],
  );
  const terminal = target ? TERMINAL_MILESTONES.includes(target) : false;

  const override = useMutation({
    mutationFn: () =>
      overrideBookingStatus(booking.id, {
        milestone: target!,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(`Booking moved to ${chosen?.label ?? target}.`, {
        description: 'The patient’s tracker has been updated.',
      });
      queryClient.invalidateQueries({ queryKey: qk.booking(booking.id) });
      queryClient.invalidateQueries({ queryKey: qk.bookings });
      onOpenChange(false);
    },
    onError: (error) => toast.error(normalizeError(error).message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        // Reopening on a different booking must not inherit the last one's
        // target — pushing the wrong visit to COMPLETED is not recoverable.
        if (!next) {
          setTarget(null);
          setNote('');
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Override booking status</DialogTitle>
          <DialogDescription>
            Move this visit through the tracker by hand. This writes the status
            and notifies the patient — it does not assign a provider or move
            any money.
          </DialogDescription>
        </DialogHeader>

        {closed ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>This booking is closed</AlertTitle>
            <AlertDescription>
              It is “{booking.status}”. Terminal bookings cannot be reopened by
              this or any other route.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Move to</Label>
              <div className="grid gap-1.5">
                {MILESTONES.map((m) => {
                  const isCurrent = m.key === current;
                  const isTarget = m.key === target;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      disabled={isCurrent}
                      onClick={() => setTarget(m.key)}
                      className={`flex items-start gap-3 rounded-lg border p-2.5 text-left transition-colors ${
                        isTarget
                          ? 'border-primary bg-accent'
                          : 'hover:bg-accent disabled:hover:bg-transparent'
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      <span className="text-muted-foreground w-5 shrink-0 pt-0.5 text-center text-xs tabular-nums">
                        {m.step || '—'}
                      </span>
                      <span className="min-w-0 flex-1 space-y-0.5">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{m.label}</span>
                          {isCurrent && (
                            <Badge variant="secondary">Current</Badge>
                          )}
                          {TERMINAL_MILESTONES.includes(m.key) && (
                            <Badge variant="outline">Terminal</Badge>
                          )}
                        </span>
                        <span className="text-muted-foreground block text-xs">
                          {m.help}
                        </span>
                        <span className="text-muted-foreground block font-mono text-[11px]">
                          status → {m.canonical}
                        </span>
                      </span>
                      {isTarget && <Check className="text-primary size-4 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {terminal && (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertTitle>This cannot be undone</AlertTitle>
                <AlertDescription>
                  {target === 'CANCELLED'
                    ? 'Prefer the Cancel button — it records a reason and releases the assigned provider. This only writes the status.'
                    : 'Completing a visit closes it and locks the patient↔provider chat. Nothing reopens it.'}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="override-note">
                Why{' '}
                <span className="text-muted-foreground font-normal">
                  (recorded on the timeline)
                </span>
              </Label>
              <Textarea
                id="override-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Nurse called in — arrived at 3:10pm but the app would not accept the tap."
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <DisabledWhenDenied
            capability="bookings.overrideStatus"
            reason="Forcing a booking through the lifecycle needs the manage_bookings permission."
          >
            <Button
              onClick={() => override.mutate()}
              disabled={!target || closed || override.isPending}
              variant={terminal ? 'destructive' : 'default'}
            >
              {override.isPending && <Loader2 className="size-4 animate-spin" />}
              {chosen ? `Move to ${chosen.label}` : 'Choose a step'}
            </Button>
          </DisabledWhenDenied>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
