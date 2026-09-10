'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Lock, MapPin, Star, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { EmptyState, TableSkeleton } from '@/components/data/states';
import { assignTeam, listDispatchCandidates } from '@/lib/api/bookings';
import { qk } from '@/lib/api/query-keys';
import { normalizeError } from '@/lib/api/errors';
import { money } from '@/lib/format';
import {
  ASSIGNABLE_STATUSES,
  type BookingWire,
  type DispatchCandidateWire,
} from '@/types/wire/booking';

const DUTY_TONE: Record<string, 'default' | 'secondary' | 'outline'> = {
  AVAILABLE: 'default',
  ON_SERVICE: 'secondary',
  OFFLINE: 'outline',
};

/**
 * The three shapes a visit can be dispatched in. These mirror the server's
 * `assignment_type` enum, but the server DERIVES that value from which ids
 * arrive rather than reading a mode field — so this is a UI concept that
 * decides which ids to send, not a wire value.
 */
type Mode = 'DOCTOR_ONLY' | 'NURSE_ONLY' | 'DUAL_TEAM';

const MODE_LABEL: Record<Mode, string> = {
  DOCTOR_ONLY: 'Doctor only',
  NURSE_ONLY: 'Nurse only',
  DUAL_TEAM: 'Dual team',
};

/** A chosen provider. The name travels with the id — see `assignTeam`. */
interface Pick {
  id: string;
  name: string;
}

function CandidateList({
  bookingId,
  role,
  selected,
  onSelect,
  height = 'h-[38vh]',
}: {
  bookingId: string;
  role: 'doctors' | 'nurses' | 'helpers';
  selected: Pick | null;
  onSelect: (pick: Pick | null) => void;
  height?: string;
}) {
  const query = useQuery({
    queryKey: qk.dispatch(bookingId, role),
    queryFn: () => listDispatchCandidates(bookingId, role),
  });

  if (query.isLoading) return <TableSkeleton rows={3} cols={2} />;
  if (!query.data?.length) {
    return <EmptyState title={`No ${role} available`} />;
  }

  return (
    <ScrollArea className={`${height} pr-3`}>
      <RadioGroup
        value={selected?.id ?? ''}
        onValueChange={(id) => {
          const found = query.data?.find((c) => c.id === id);
          onSelect(found ? { id, name: found.full_name } : null);
        }}
      >
        <div className="space-y-2">
          {query.data.map((c: DispatchCandidateWire) => (
            <Label
              key={c.id}
              htmlFor={`cand-${role}-${c.id}`}
              className="hover:bg-accent flex cursor-pointer items-start gap-3 rounded-lg border p-3"
            >
              <RadioGroupItem
                value={c.id}
                id={`cand-${role}-${c.id}`}
                className="mt-1"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.full_name}</span>
                  <Badge variant={DUTY_TONE[c.dispatch_status ?? 'OFFLINE']}>
                    {(c.dispatch_status ?? 'OFFLINE').replace('_', ' ')}
                  </Badge>
                  {c.verification_status === 'verified' && (
                    <Badge variant="outline">Verified</Badge>
                  )}
                </div>
                <p className="text-muted-foreground text-sm">
                  {c.specialization || c.specialty || '—'}
                  {c.fee ? ` · ${money(c.fee)}` : ''}
                </p>
                <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
                  {typeof c.rating === 'number' && (
                    <span className="inline-flex items-center gap-1">
                      <Star className="size-3" /> {c.rating.toFixed(2)}
                    </span>
                  )}
                  {typeof c.distance_km === 'number' && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3" /> {c.distance_km.toFixed(1)} km
                    </span>
                  )}
                  {typeof c.active_job_count === 'number' && (
                    <span>{c.active_job_count} active job(s)</span>
                  )}
                </div>
              </div>
            </Label>
          ))}
        </div>
      </RadioGroup>
    </ScrollArea>
  );
}

// Local import to avoid pulling the whole form stack into this file.
function Label(props: React.ComponentProps<'label'>) {
  return <label {...props} />;
}

/** One role's slot in dual mode: heading, current pick, and its list. */
function RoleSection({
  title,
  bookingId,
  role,
  selected,
  onSelect,
}: {
  title: string;
  bookingId: string;
  role: 'doctors' | 'nurses';
  selected: Pick | null;
  onSelect: (pick: Pick | null) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{title}</h4>
        {selected ? (
          <Badge variant="secondary" className="gap-1">
            <UserRound className="size-3" />
            {selected.name}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">Not selected</span>
        )}
      </div>
      <CandidateList
        bookingId={bookingId}
        role={role}
        selected={selected}
        onSelect={onSelect}
        height="h-[26vh]"
      />
    </div>
  );
}

export function DispatchSheet({
  booking,
  open,
  onOpenChange,
}: {
  booking: BookingWire;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  // Default to the shape this booking already has, so reopening the sheet on
  // an assigned visit lands the operator in the mode they're editing rather
  // than silently offering to turn a dual team into a solo doctor.
  const initialMode: Mode = useMemo(() => {
    if (booking.assignment_type === 'DUAL_TEAM') return 'DUAL_TEAM';
    if (booking.assignment_type === 'NURSE_ONLY') return 'NURSE_ONLY';
    if (booking.assignment_type === 'DOCTOR_ONLY') return 'DOCTOR_ONLY';
    // No team yet — fall back to what the booking asked for. `provider_type`
    // is uppercase on the wire, unlike `assignment_type`'s neighbours.
    return booking.provider_type === 'NURSE' ? 'NURSE_ONLY' : 'DOCTOR_ONLY';
  }, [booking.assignment_type, booking.provider_type]);

  const [mode, setMode] = useState<Mode>(initialMode);

  // Seeded from the existing assignment so a reassignment shows the current
  // team and the operator can swap ONE role without re-picking the other.
  const [doctor, setDoctor] = useState<Pick | null>(
    booking.assigned_doctor_id
      ? {
          id: booking.assigned_doctor_id,
          name: booking.assigned_doctor_name ?? '',
        }
      : null,
  );
  const [nurse, setNurse] = useState<Pick | null>(
    booking.assigned_nurse_id
      ? {
          id: booking.assigned_nurse_id,
          name: booking.assigned_nurse_name ?? '',
        }
      : null,
  );
  const [helper, setHelper] = useState<Pick | null>(
    booking.assigned_helper_id
      ? {
          id: booking.assigned_helper_id,
          name: booking.assigned_helper_name ?? '',
        }
      : null,
  );

  /**
   * The server refuses an assignment unless the deposit is settled AND a
   * positive final price exists, and it reports both as bare `{message}` 400s
   * with no error_code. Checking here means the operator sees why the button
   * is inert instead of discovering it on submit.
   */
  const feeSet = Number(booking.final_price ?? 0) > 0;
  /**
   * THE payment gate.
   *
   * `is_payment_confirmed` is derived server-side from the settlement stamps
   * (see `projectInvoice` in `backend/src/models/CareRequest.js`), so it agrees
   * with the money by construction. The fallback reproduces that derivation for
   * a row served by an older backend — checking `deposit_amount` alongside the
   * timestamp, because an in-visit booking settles without its status moving.
   */
  const paymentConfirmed =
    booking.is_payment_confirmed ??
    (Boolean(booking.deposit_paid_at) || Number(booking.deposit_amount ?? 0) > 0);
  const assignable = (ASSIGNABLE_STATUSES as readonly string[]).includes(
    booking.status,
  );
  const blockers: string[] = [];
  if (!feeSet) blockers.push('a final service fee has not been set');
  if (!paymentConfirmed) blockers.push('the advance deposit has not been paid');
  if (!assignable) blockers.push(`the booking is "${booking.status}"`);

  const needsDoctor = mode === 'DOCTOR_ONLY' || mode === 'DUAL_TEAM';
  const needsNurse = mode === 'NURSE_ONLY' || mode === 'DUAL_TEAM';
  const teamComplete =
    (!needsDoctor || Boolean(doctor)) && (!needsNurse || Boolean(nurse));

  const assign = useMutation({
    mutationFn: () =>
      assignTeam(booking.id, {
        // Only the roles this mode dispatches are sent. Omitting a role leaves
        // any existing assignment for it untouched server-side — the handler
        // only writes `assigned_*_id` when the id is present in the body.
        ...(needsDoctor && doctor
          ? { doctor_id: doctor.id, doctor_name: doctor.name }
          : {}),
        ...(needsNurse && nurse
          ? { nurse_id: nurse.id, nurse_name: nurse.name }
          : {}),
        // `helper_id` is read with `!== undefined`, so sending null is how a
        // helper gets REMOVED. Send the key only when we mean to write it.
        ...(helper ? { helper_id: helper.id, helper_name: helper.name } : {}),
        final_price: Number(booking.final_price ?? 0),
      }),
    onSuccess: () => {
      toast.success(
        mode === 'DUAL_TEAM'
          ? 'Dual team dispatched.'
          : 'Provider dispatched.',
      );
      queryClient.invalidateQueries({ queryKey: qk.booking(booking.id) });
      queryClient.invalidateQueries({ queryKey: qk.bookings });
      onOpenChange(false);
    },
    // The provider-busy 400 carries a human message naming the conflicting
    // booking. Show it as-is.
    onError: (error) => toast.error(normalizeError(error).message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Dispatch a care team</SheetTitle>
          <SheetDescription>
            Availability, distance and current workload are computed per
            booking. Providers already on a job within two hours of this slot
            are rejected by the server.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4">
          {blockers.length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>Not ready to dispatch</AlertTitle>
              <AlertDescription>
                You can dispatch once {blockers.join(' and ')}.
              </AlertDescription>
            </Alert>
          )}

          {/*
            THE ASSIGNMENT GATE, rendered as a wall rather than a greyed list.

            Until the advance is in, no clinician may be selected at all. A
            disabled roster would still show names, distances and workloads —
            an operator would pick someone, find the button inert, and read that
            as a bug in the roster rather than as "this visit is not paid for".
            Stating the one blocking fact, and nothing else, is what makes the
            next step obvious.

            It also keeps three candidate rosters off the wire for a booking
            nobody can be dispatched to: each list is its own request, and they
            are the most expensive reads on this page.
          */}
          {!paymentConfirmed ? (
            <div className="space-y-3 rounded-lg border border-dashed p-6 text-center">
              <Lock className="text-muted-foreground mx-auto size-8" />
              <div className="space-y-1">
                <p className="font-medium">Assignment is locked</p>
                <p className="text-muted-foreground mx-auto max-w-sm text-sm">
                  {feeSet
                    ? 'No clinician can be selected until the advance deposit is received. Confirm the received amount on the booking’s Money card, then dispatch.'
                    : 'This booking has no invoice yet. Build the invoice and quote an advance, then confirm the payment to unlock dispatch.'}
                </p>
              </div>
            </div>
          ) : (
          <>
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Team shape</h4>
            <ToggleGroup
              type="single"
              value={mode}
              // A toggle group returns '' when the active item is re-clicked.
              // Ignoring the empty value keeps a mode always selected.
              onValueChange={(v) => v && setMode(v as Mode)}
              variant="outline"
              className="w-full"
            >
              {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
                <ToggleGroupItem key={m} value={m} className="flex-1">
                  {MODE_LABEL[m]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {open && mode === 'DOCTOR_ONLY' && (
            <CandidateList
              bookingId={booking.id}
              role="doctors"
              selected={doctor}
              onSelect={setDoctor}
            />
          )}

          {open && mode === 'NURSE_ONLY' && (
            <CandidateList
              bookingId={booking.id}
              role="nurses"
              selected={nurse}
              onSelect={setNurse}
            />
          )}

          {open && mode === 'DUAL_TEAM' && (
            <div className="space-y-4">
              <RoleSection
                title="Doctor"
                bookingId={booking.id}
                role="doctors"
                selected={doctor}
                onSelect={setDoctor}
              />
              <RoleSection
                title="Nurse"
                bookingId={booking.id}
                role="nurses"
                selected={nurse}
                onSelect={setNurse}
              />
            </div>
          )}

          {/* Helpers attach to any shape. They cannot be dispatched alone —
              the server requires a doctor or a nurse — so this stays a
              secondary, clearable slot rather than a fourth mode. */}
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Attach a helper{' '}
              <span className="text-muted-foreground font-normal">
                {helper ? `— ${helper.name}` : '(optional)'}
              </span>
            </summary>
            <div className="mt-3 space-y-2">
              {helper && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setHelper(null)}
                  className="gap-1"
                >
                  <X className="size-3" /> Clear helper
                </Button>
              )}
              {open && (
                <CandidateList
                  bookingId={booking.id}
                  role="helpers"
                  selected={helper}
                  onSelect={setHelper}
                  height="h-[24vh]"
                />
              )}
            </div>
          </details>
          </>
          )}
        </div>

        <SheetFooter>
          <Button
            onClick={() => assign.mutate()}
            disabled={!teamComplete || blockers.length > 0 || assign.isPending}
          >
            {assign.isPending && <Loader2 className="size-4 animate-spin" />}
            {mode === 'DUAL_TEAM'
              ? 'Assign doctor + nurse'
              : mode === 'NURSE_ONLY'
                ? 'Assign nurse'
                : 'Assign doctor'}
          </Button>
          {mode === 'DUAL_TEAM' && !teamComplete && (
            <p className="text-muted-foreground text-xs">
              Select both a doctor and a nurse to dispatch a dual team.
            </p>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
