'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, SlidersHorizontal } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiErrorState } from '@/components/rbac/api-error-state';
import { ArchivedInvoice } from '@/components/bookings/archived-invoice';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/data/states';
import { PageHeader } from '@/components/layout/page-header';
import { getBooking } from '@/lib/api/bookings';
import { qk } from '@/lib/api/query-keys';
import { bookingRef, dateTime, humanize, money } from '@/lib/format';
import { TERMINAL_STATUSES } from '@/types/wire/booking';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{value ?? '—'}</dd>
    </div>
  );
}

/**
 * One closed booking, read-only, with its finalized invoice.
 *
 * ## Why a separate route from `/dashboard/bookings/[id]`
 *
 * That page is the operations console: pricing, dispatch, cancellation, status
 * override. Every one of those actions is refused by the server on a terminal
 * booking, so on a closed row it is a screen of controls that cannot be used —
 * and an operator taking a billing call has to scroll past all of them to
 * reach the numbers they were asked about. This route answers the archive's
 * question instead: what was this visit, what was it billed, and can I send
 * the patient their receipt.
 *
 * The ops console stays one click away for the rare case where an operator
 * genuinely needs it — a terminal booking still has a dispatch history and
 * attachments worth reading.
 *
 * It reads the SAME endpoint. There is no archive-specific fetch, because the
 * archive is not a different document — it is the same booking with its
 * `invoice` frozen.
 */
export function ArchivedBookingDetail({ id }: { id: string }) {
  const booking = useQuery({
    queryKey: qk.booking(id),
    queryFn: () => getBooking(id),
    staleTime: 10 * 60_000,
  });

  if (booking.isError) {
    return (
      <ApiErrorState error={booking.error} onRetry={() => booking.refetch()} />
    );
  }
  if (booking.isLoading || !booking.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const b = booking.data;
  const closed = (TERMINAL_STATUSES as readonly string[]).includes(b.status);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/dashboard/bookings/history">
          <ArrowLeft className="size-4" />
          Invoice archive
        </Link>
      </Button>

      <PageHeader
        title={b.patient_name}
        description={`#${bookingRef(b.id)} · ${b.care_type}${b.area ? ` · ${b.area}` : ''}`}
        actions={
          <Button variant="outline" asChild>
            <Link href={`/dashboard/bookings/${b.id}`}>
              <SlidersHorizontal className="size-4" />
              Open in ops console
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={b.status} />
        {b.invoice_finalized_at && (
          <Badge variant="outline">
            Receipt frozen {dateTime(b.invoice_finalized_at)}
          </Badge>
        )}
      </div>

      {/*
        A booking that is still running has no receipt to lock, and pretending
        otherwise would be the worse failure: an operator reading a "final"
        invoice on a visit whose price can still change. The ops console is
        where an in-flight booking belongs, so say so and point at it.
      */}
      {!closed && (
        <EmptyState
          title="This booking is still open"
          description="A receipt is issued once the visit is completed or cancelled. Price and dispatch it from the ops console."
        />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Visit</CardTitle>
            <CardDescription>What was delivered, and by whom.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <Field label="Patient phone" value={b.patient_phone} />
              <Field label="Service" value={b.care_type} />
              <Field label="Location" value={b.location_text} />
              <Field
                label="Provider"
                value={
                  b.assigned_doctor_name ??
                  b.assigned_nurse_name ??
                  'Not assigned'
                }
              />
              <Field
                label="Closed"
                value={dateTime(b.completed_at ?? b.updated_at)}
              />
              {b.status !== 'completed' && (
                <>
                  <Field
                    label="Cancelled by"
                    value={humanize(b.cancelled_by ?? null)}
                  />
                  <Field
                    label="Reason"
                    value={b.cancellation_reason ?? '—'}
                  />
                </>
              )}
              {/*
                The quoted fee, kept beside the receipt rather than inside it.
                It is PRE-discount and it is not what anybody paid, so it
                belongs in the visit record an operator reads for context — not
                in the ledger, where a patient-facing figure has to be what was
                charged.
              */}
              <Field label="Quoted fee" value={money(b.final_price)} />
            </dl>
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          {b.invoice ? (
            <ArchivedInvoice
              bookingId={b.id}
              invoice={b.invoice}
              patientName={b.patient_name}
            />
          ) : (
            <EmptyState
              title="No receipt for this booking"
              description={
                closed
                  ? 'No payment was ever taken against it, so there is nothing to receipt.'
                  : 'A receipt is frozen when the booking closes.'
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
