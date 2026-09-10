'use client';

import { useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Receipt, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
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
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState, TableSkeleton } from '@/components/data/states';
import { listCompletedBookings } from '@/lib/api/bookings';
import { qk } from '@/lib/api/query-keys';
import { bookingRef, dateTime, money } from '@/lib/format';
import type { BookingWire } from '@/types/wire/booking';

const STATUS_FILTERS = [
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All closed' },
] as const;

const PAGE_SIZE = 25;

/**
 * The archive list.
 *
 * ## Server-side search, unlike the working queue
 *
 * `BookingsTable` fetches every booking once and filters in the browser, which
 * is right for a queue an operator works through in a day. The archive only
 * grows, so the same approach would mean shipping a year of bookings to find
 * three. `GET /admin/bookings/completed` pages and searches in Mongo, and this
 * table sends its filters there.
 *
 * `keepPreviousData` is what makes paging feel like paging: without it the
 * table empties to a skeleton on every page change, and an operator comparing
 * two pages loses their place.
 */
export function ArchiveTable() {
  const [status, setStatus] = useState<string>('completed');
  const [q, setQ] = useState('');
  // The term the QUERY runs on, moved only when the operator submits. Typing
  // straight into the query key would fire a request per keystroke against an
  // endpoint that runs a regex scan.
  const [submitted, setSubmitted] = useState('');
  const [page, setPage] = useState(1);

  const query = { status, q: submitted, page, limit: PAGE_SIZE };
  const archive = useQuery({
    queryKey: qk.bookingArchive(query),
    queryFn: () => listCompletedBookings(query),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  function applySearch(next: string) {
    setSubmitted(next.trim());
    setPage(1);
  }

  if (archive.isError) {
    return (
      <ApiErrorState error={archive.error} onRetry={() => archive.refetch()} />
    );
  }

  const rows = archive.data?.bookings ?? [];
  const total = archive.data?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          applySearch(q);
        }}
      >
        <div className="relative min-w-[220px] flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search patient, phone or service"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select
          value={status}
          onValueChange={(next) => {
            setStatus(next);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {archive.isLoading ? (
        <TableSkeleton cols={6} />
      ) : !rows.length ? (
        <EmptyState
          title="No closed bookings match"
          description="Try a different status, widen the search, or clear it."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total paid</TableHead>
                  <TableHead>Closed</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((booking: BookingWire) => (
                  <TableRow key={booking.id}>
                    <TableCell className="font-mono text-xs">
                      {bookingRef(booking.id)}
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
                    <TableCell>
                      <StatusBadge status={booking.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {/*
                        What was actually COLLECTED, off the frozen receipt —
                        not `final_price`, which is the pre-discount quote and
                        overstates every discounted visit. A row with no
                        receipt took no money, and an em dash says that more
                        honestly than ৳0.
                      */}
                      {booking.invoice
                        ? money(booking.invoice.total_paid)
                        : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {dateTime(booking.completed_at ?? booking.updated_at)}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link
                          href={`/dashboard/bookings/history/${booking.id}`}
                        >
                          <Receipt className="size-4" />
                          Receipt
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm tabular-nums">
              {from}–{to} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || archive.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!archive.data?.hasMore || archive.isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
