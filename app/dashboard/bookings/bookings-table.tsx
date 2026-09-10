'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiErrorState } from '@/components/rbac/api-error-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState, TableSkeleton } from '@/components/data/states';
import {
  DataCard,
  DataCardActions,
  DataCardBody,
  DataCardField,
  DataCardHeader,
  ResponsiveTable,
} from '@/components/data/responsive-table';
import { PatientContactActions } from '@/components/bookings/patient-contact-actions';
import { bulkUpdateStatus, listBookings } from '@/lib/api/bookings';
import { qk } from '@/lib/api/query-keys';
import { bookingRef, dateTime, humanize, money } from '@/lib/format';
import { normalizeError } from '@/lib/api/errors';
import type { BookingWire } from '@/types/wire/booking';

const STATUS_FILTERS = [
  'all',
  'submitted',
  'deposit_required',
  'deposit_paid_admin_reviewing',
  'approved',
  'assigned',
  'in_service',
  'completed',
  'cancelled',
  'rejected',
] as const;

export function BookingsTable({ highlight }: { highlight?: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  /**
   * Widened from `HTMLTableRowElement` because the highlighted row is a `<tr>`
   * on a desktop and a `<div>` card on a phone. Only one of the two is ever
   * mounted, so the ref still holds exactly one node.
   */
  const highlightRow = useRef<HTMLElement | null>(null);
  const scrolled = useRef(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'rejected' | 'cancelled' | null>(
    null,
  );

  /**
   * `/admin/requests` is unpaginated, unlimited, and mints an HMAC-signed
   * presigned grant for every attachment on every row. So: fetch once, filter
   * in the browser, and hold it longer than anything else on the portal. It is
   * explicitly NOT polled.
   */
  const bookings = useQuery({
    queryKey: qk.bookings,
    queryFn: listBookings,
    staleTime: 120_000,
  });

  const bulk = useMutation({
    mutationFn: (action: 'rejected' | 'cancelled') =>
      bulkUpdateStatus([...selected], action),
    onSuccess: (result, action) => {
      toast.success(`${result.updated} booking(s) ${humanize(action).toLowerCase()}.`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: qk.bookings });
    },
    onError: (error) => toast.error(normalizeError(error).message),
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (bookings.data ?? []).filter((b) => {
      if (status !== 'all' && b.status !== status) return false;
      if (!term) return true;
      return (
        b.patient_name?.toLowerCase().includes(term) ||
        b.care_type?.toLowerCase().includes(term) ||
        b.area?.toLowerCase().includes(term) ||
        b.patient_phone?.toLowerCase().includes(term) ||
        b.id?.toLowerCase().includes(term)
      );
    });
  }, [bookings.data, search, status]);

  /**
   * Bring a `?highlight=<id>` row into view once the list has loaded. One-shot
   * via the ref, so it doesn't yank the viewport back while the coordinator is
   * scrolling or filtering.
   *
   * The row is only found while it survives the current filters. That is
   * deliberate — a link arrives on a fresh page where both filters are open, and
   * overriding a filter the coordinator set themselves would be worse than
   * quietly not scrolling.
   */
  useEffect(() => {
    if (scrolled.current || !highlight || !highlightRow.current) return;
    scrolled.current = true;
    highlightRow.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlight, rows]);

  /**
   * A callback ref rather than the object handed to two elements, because the
   * highlighted booking is rendered TWICE — once as a table row, once as a card
   * — and only the one its breakpoint selects is in the DOM. Assigning only on
   * mount means the hidden twin's unmount (`node === null`) cannot blank the
   * reference the effect above is about to read.
   */
  const captureHighlight = (node: HTMLElement | null) => {
    if (node) highlightRow.current = node;
  };

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (bookings.isError) {
    return (
      <ApiErrorState error={bookings.error} onRetry={() => bookings.refetch()} />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-auto">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search patient, service, area or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === 'all' ? 'All statuses' : humanize(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selected.size > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <span className="text-sm font-medium">
              {selected.size} selected
            </span>
            {/* The server accepts ONLY `rejected` and `cancelled` in bulk.
                Approving is not a bulk action, because approval means choosing
                and dispatching a specific provider. */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBulkAction('rejected')}
            >
              Reject
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBulkAction('cancelled')}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </CardContent>
        </Card>
      )}

      {bookings.isLoading ? (
        <TableSkeleton cols={7} />
      ) : !rows.length ? (
        <EmptyState
          title="No bookings match"
          description="Try a different status filter or clear the search."
        />
      ) : (
        <ResponsiveTable
          cards={rows.map((booking: BookingWire) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              highlighted={booking.id === highlight}
              ref={booking.id === highlight ? captureHighlight : undefined}
              selected={selected.has(booking.id)}
              onToggle={() => toggle(booking.id)}
            />
          ))}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Patient</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Fee</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((booking: BookingWire) => (
                <TableRow
                  key={booking.id}
                  ref={booking.id === highlight ? captureHighlight : undefined}
                  className={
                    booking.id === highlight
                      ? 'bg-accent/50 hover:bg-accent/60'
                      : undefined
                  }
                >
                  <TableCell>
                    <Checkbox
                      checked={selected.has(booking.id)}
                      onCheckedChange={() => toggle(booking.id)}
                      aria-label={`Select booking for ${booking.patient_name}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {booking.patient_name}
                    <div className="text-muted-foreground text-xs">
                      {booking.patient_phone}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate">
                    {booking.care_type}
                  </TableCell>
                  <TableCell>{booking.area || '—'}</TableCell>
                  <TableCell>
                    <StatusBadge status={booking.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(booking.final_price ?? booking.offered_budget)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {dateTime(booking.created_at)}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/dashboard/bookings/${booking.id}`}>Open</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ResponsiveTable>
      )}

      <ConfirmDialog
        open={bulkAction !== null}
        onOpenChange={(open) => !open && setBulkAction(null)}
        title={`${bulkAction === 'rejected' ? 'Reject' : 'Cancel'} ${selected.size} booking(s)?`}
        description={
          <p>
            This notifies the affected patients and releases any assigned
            providers. It cannot be undone from here.
          </p>
        }
        confirmLabel={bulkAction === 'rejected' ? 'Reject' : 'Cancel bookings'}
        destructive
        onConfirm={async () => {
          if (bulkAction) await bulk.mutateAsync(bulkAction);
        }}
      />
    </div>
  );
}

/**
 * One booking as a card, for the `< md` view.
 *
 * The column order is not preserved and should not be. A table is read left to
 * right by an operator who already knows what each column means; a card is read
 * top to bottom by someone holding a phone, and the questions come in a
 * different order — WHICH booking is this (the reference), what STATE is it in,
 * WHO is it for, and then the detail. The fee sits at the bottom of the body
 * where it reads as a total rather than as one more field.
 *
 * The three actions in the footer are the three things worth doing from a
 * list: ring them, message them, or open the booking. They are the same pair of
 * hand-offs the detail screen offers, sharing one `usePatientContact` so the
 * WhatsApp text a patient receives does not depend on which screen it was sent
 * from.
 */
function BookingCard({
  booking,
  highlighted,
  selected,
  onToggle,
  ref,
}: {
  booking: BookingWire;
  highlighted: boolean;
  selected: boolean;
  onToggle: () => void;
  ref?: (node: HTMLElement | null) => void;
}) {
  return (
    <DataCard
      ref={ref}
      className={highlighted ? 'ring-primary/40 ring-2' : undefined}
    >
      <DataCardHeader
        primary={
          <>
            <Checkbox
              checked={selected}
              onCheckedChange={onToggle}
              aria-label={`Select booking for ${booking.patient_name}`}
            />
            {/* The id's tail, which is the reference an operator reads to a
                patient on the phone and the string the search box above
                matches. The full 24-hex ObjectId is unspeakable and would not
                fit here anyway. */}
            <span className="font-mono text-xs font-medium">
              #{bookingRef(booking.id)}
            </span>
          </>
        }
        secondary={<StatusBadge status={booking.status} />}
      />

      <DataCardBody>
        <div className="min-w-0">
          <p className="truncate font-medium">{booking.patient_name}</p>
          <p className="text-muted-foreground truncate text-xs">
            {booking.patient_phone || 'No phone on file'}
          </p>
        </div>
        <DataCardField label="Service" value={booking.care_type} />
        <DataCardField label="Area" value={booking.area || '—'} />
        <DataCardField label="Created" value={dateTime(booking.created_at)} />
        <DataCardField
          label="Fee"
          value={
            <span className="font-medium tabular-nums">
              {money(booking.final_price ?? booking.offered_budget)}
            </span>
          }
        />
      </DataCardBody>

      <DataCardActions>
        <PatientContactActions
          layout="inline"
          bookingId={booking.id}
          phone={booking.patient_phone}
          patientName={booking.patient_name}
          serviceName={booking.care_type}
        />
        <Button variant="default" size="sm" asChild>
          <Link href={`/dashboard/bookings/${booking.id}`}>View details</Link>
        </Button>
      </DataCardActions>
    </DataCard>
  );
}
