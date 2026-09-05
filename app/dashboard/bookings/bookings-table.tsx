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
import { bulkUpdateStatus, listBookings } from '@/lib/api/bookings';
import { qk } from '@/lib/api/query-keys';
import { dateTime, humanize, money } from '@/lib/format';
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
  const highlightRow = useRef<HTMLTableRowElement | null>(null);
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
        <div className="relative min-w-[220px] flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search patient, service, area or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[220px]">
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
        <div className="overflow-x-auto rounded-lg border">
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
                  ref={booking.id === highlight ? highlightRow : undefined}
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
        </div>
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
