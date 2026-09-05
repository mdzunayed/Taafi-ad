'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BadgeCheck,
  FileText,
  Loader2,
  Paperclip,
  Receipt,
  SlidersHorizontal,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiErrorState } from '@/components/rbac/api-error-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { DocumentPreview } from '@/components/common/document-preview';
import { StatusBadge } from '@/components/common/status-badge';
import { PageHeader } from '@/components/layout/page-header';
import {
  cancelBooking,
  confirmDepositReceived,
  type ConfirmPaymentBody,
  getBooking,
} from '@/lib/api/bookings';
import { qk } from '@/lib/api/query-keys';
import { normalizeError } from '@/lib/api/errors';
import { DisabledWhenDenied } from '@/components/rbac/can';
import { dateTime, humanize, money } from '@/lib/format';
import { InvoiceDialog } from './invoice-dialog';
import { DispatchSheet } from './dispatch-sheet';
import { ConfirmPaymentDialog } from './confirm-payment-dialog';
import { StatusOverrideDialog } from './status-override';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{value ?? '—'}</dd>
    </div>
  );
}

export function BookingDetail({
  id,
  initialAction,
}: {
  id: string;
  initialAction?: string;
}) {
  const queryClient = useQueryClient();
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [confirmPayOpen, setConfirmPayOpen] = useState(false);
  /**
   * The deep-link action, held until the operator dismisses whichever dialog it
   * opened. State rather than a bare read of the prop so that closing clears it
   * for good — otherwise the dialog would re-open on the next render.
   */
  const [pendingAction, setPendingAction] = useState(initialAction ?? null);
  const urlCleaned = useRef(false);

  /**
   * Always read the booking through this endpoint before touching an
   * attachment. Presigned document grants live 30 minutes; the copies sitting
   * on a list row that was fetched an hour ago are dead. Re-reading here is
   * what keeps the preview from showing a broken file.
   */
  const booking = useQuery({
    queryKey: qk.booking(id),
    queryFn: () => getBooking(id),
    // Shorter than the grant lifetime, so an open tab re-mints links before
    // they expire rather than after.
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: true,
  });

  const cancel = useMutation({
    mutationFn: (reason: string) => cancelBooking(id, { reason }),
    onSuccess: () => {
      toast.success('Booking cancelled.');
      queryClient.invalidateQueries({ queryKey: qk.booking(id) });
      queryClient.invalidateQueries({ queryKey: qk.bookings });
    },
    onError: (error) => toast.error(normalizeError(error).message),
  });

  /**
   * Settle a deposit the patient never filed a claim for, then hand the
   * operator straight to dispatch — confirming the money is only ever step one
   * of "this visit is now happening", and making them find the Dispatch button
   * afterwards is how bookings sit paid-but-unassigned.
   */
  const confirmPayment = useMutation({
    mutationFn: (body: ConfirmPaymentBody) => confirmDepositReceived(id, body),
    onSuccess: (updated, body) => {
      toast.success(
        body.paymentType === 'FULL'
          ? 'Full payment confirmed.'
          : 'Deposit confirmed.',
      );
      /**
       * Merge rather than replace. This response is a bare `toJSON()` with no
       * `attachments` key, while the cached row came from `GET /bookings/:id`,
       * which decorates one on. Spreading an object that lacks the key leaves
       * the presigned links intact; `setQueryData(…, updated)` would blank the
       * documents card until the refetch below lands.
       *
       * Seeding the cache at all is what lets the dispatch sheet open on the
       * next line without flashing its "deposit has not been paid" blocker.
       */
      queryClient.setQueryData(qk.booking(id), (prev?: typeof updated) =>
        prev ? { ...prev, ...updated } : updated,
      );
      queryClient.invalidateQueries({ queryKey: qk.booking(id) });
      queryClient.invalidateQueries({ queryKey: qk.bookings });
      /**
       * Close the confirmation and open dispatch in ONE batch. `ConfirmDialog`
       * would close itself once this handler's promise resolves, but that is a
       * later tick — the sheet would already have opened underneath a still-
       * mounted alert dialog, and two overlapping Radix modals fight over
       * focus and the scroll lock. Same `onOpenChange(false)`-in-onSuccess
       * shape the invoice dialog uses.
       */
      setConfirmPayOpen(false);
      setDispatchOpen(true);
    },
    // 409 when the invoice was never finalised or the booking has left a
    // payable status, 403 for support staff. Both carry a usable sentence.
    onError: (error) => toast.error(normalizeError(error).message),
  });

  /**
   * Strip `?action=` once it has been captured into state, so a refresh after
   * closing the dialog lands on a plain detail page.
   *
   * `history.replaceState` rather than `router.replace`: the latter triggers a
   * soft navigation that re-renders the page and can flicker the dialog that
   * was just opened. Rewriting the URL is external-system work, which is what
   * an effect is actually for — the dialog itself opens via derived state
   * below, not by setting state in here.
   */
  useEffect(() => {
    if (urlCleaned.current || !initialAction) return;
    urlCleaned.current = true;
    window.history.replaceState(null, '', `/dashboard/bookings/${id}`);
  }, [initialAction, id]);

  if (booking.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (booking.isError || !booking.data) {
    return (
      <ApiErrorState error={booking.error} onRetry={() => booking.refetch()} />
    );
  }

  const b = booking.data;
  const attachments = b.attachments ?? b.documents ?? [];

  /**
   * The deposit is settled once money is recorded against it, by whichever
   * rail — gateway, verification queue, or the button below. `deposit_amount`
   * is checked alongside the timestamp because that is the pair the server's
   * own idempotency guard reads.
   */
  const depositSettled =
    Boolean(b.deposit_paid_at) || Number(b.deposit_amount ?? 0) > 0;
  /**
   * What this booking was quoted. Zero means the review call never committed a
   * deposit, so there is nothing to confirm receipt OF — the server 409s on
   * that, and the button stays hidden rather than offering the failure.
   */
  const depositAmount = Number(b.required_deposit ?? b.deposit_quoted_amount ?? 0);
  /**
   * Whether the action APPLIES — deliberately not whether this operator may
   * take it. `canConfirmPayment` used to be folded in here, which hid the
   * button entirely from support staff; `DisabledWhenDenied` at the render site
   * shows it greyed with a tooltip instead, per the guidance in
   * `components/rbac/can.tsx`. A vanished button just looks like a bug.
   */
  const showConfirmPayment = !depositSettled && depositAmount > 0;
  /**
   * What is still owed after the deposit and any discount — the same arithmetic
   * the invoice dialog shows. `null` when no fee has been set, because "0 due"
   * and "nobody has priced this yet" are different answers and the confirm
   * dialog must not present the second as the first.
   */
  const balanceDue =
    Number(b.final_price ?? 0) > 0
      ? Number(b.final_price) -
        depositAmount -
        Number(b.adjusted_discount ?? 0)
      : null;
  // The patient DID file a claim, so the verification queue is the better tool
  // — it shows the reference to match against the statement. Confirming here
  // still works and still settles that claim; the dialog just says so.
  const claimPending =
    b.deposit_manual_status === 'PENDING_ADMIN_VERIFICATION';

  /**
   * Resolve the deep-link action against booking state — the param is a hint,
   * the booking is the authority. Dispatch is hard-blocked until a fee is set
   * and the deposit is paid, so an `assign` link that arrives too early opens
   * the pricing dialog rather than a sheet with every button inert. That also
   * lets a future "deposit cleared" alert send `?action=assign` unchanged.
   *
   * Derived per render rather than pushed into state from an effect: an effect
   * would fight the operator, since `refetchOnWindowFocus` re-runs it on every
   * focus and would re-open the dialog they just closed.
   */
  let autoAction: 'invoice' | 'assign' | null = null;
  if (pendingAction === 'invoice') {
    autoAction = 'invoice';
  } else if (pendingAction === 'assign') {
    const dispatchable = Number(b.final_price ?? 0) > 0 && Boolean(b.deposit_paid_at);
    autoAction = dispatchable ? 'assign' : 'invoice';
  }

  // Closing clears the deep-link action for good, so it can't spring back.
  const closeWith =
    (setOpen: (open: boolean) => void) =>
    (open: boolean) => {
      setOpen(open);
      if (!open) setPendingAction(null);
    };

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/dashboard/bookings">
          <ArrowLeft className="size-4" />
          All bookings
        </Link>
      </Button>

      <PageHeader
        title={b.patient_name}
        description={`${b.care_type}${b.area ? ` · ${b.area}` : ''}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setInvoiceOpen(true)}>
              <Receipt className="size-4" />
              Invoice
            </Button>
            {/*
              One primary action at a time. While the deposit is outstanding
              the real next step is confirming the money — which is now a
              primary button on the Money card — so Dispatch steps back to an
              outline rather than competing with it. It stays CLICKABLE either
              way: the sheet names the blockers, which is more use than an
              inert button.
            */}
            <Button
              variant={showConfirmPayment ? 'outline' : 'default'}
              onClick={() => setDispatchOpen(true)}
            >
              <UserPlus className="size-4" />
              Dispatch
            </Button>
            {/*
              The manual driver for the patient's tracker, for when the real
              world and the database disagree — a provider who arrived without
              tapping, a visit wedged in a state no actor can move it out of.
              An outline button beside the primary flow: it is a correction,
              not a step anybody should be taking routinely.
            */}
            <Button variant="outline" onClick={() => setOverrideOpen(true)}>
              <SlidersHorizontal className="size-4" />
              Status
            </Button>
            <Button variant="outline" onClick={() => setCancelOpen(true)}>
              <XCircle className="size-4" />
              Cancel
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={b.status} />
        {b.milestone && <Badge variant="outline">{humanize(b.milestone)}</Badge>}
        {b.urgency_level && (
          <Badge variant="secondary">{humanize(b.urgency_level)}</Badge>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Request</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Patient phone" value={b.patient_phone} />
              <Field label="Service" value={b.care_type} />
              <Field label="Location" value={b.location_text} />
              <Field label="Area" value={b.area} />
              <Field
                label="Scheduled"
                value={
                  b.scheduled_time || b.preferred_time
                    ? dateTime(b.scheduled_time ?? b.preferred_time)
                    : 'As soon as possible'
                }
              />
              <Field label="Duration" value={`${b.duration_hours ?? 1} hour(s)`} />
              <Field label="Created" value={dateTime(b.created_at)} />
              <Field label="Condition note" value={b.condition_note} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Money</CardTitle>
            <CardDescription>
              {b.deposit_paid_at
                ? 'Deposit settled — only the final fee can change.'
                : 'Deposit not yet paid.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <Field label="Patient offer" value={money(b.offered_budget)} />
              <Field label="Final service fee" value={money(b.final_price)} />
              <Field
                label="Required deposit"
                value={money(b.required_deposit ?? b.deposit_quoted_amount)}
              />
              <Field label="Discount" value={money(b.adjusted_discount)} />
              <Separator />
              <Field
                label="Deposit paid"
                value={b.deposit_paid_at ? dateTime(b.deposit_paid_at) : 'No'}
              />
              <Field
                label="Balance paid"
                value={b.final_paid_at ? dateTime(b.final_paid_at) : 'No'}
              />
              <Field
                label="Payment preference"
                value={humanize(b.payment_preference)}
              />
              <Field label="Paid via" value={humanize(b.payment_channel)} />
              <Field
                label="Balance verification"
                value={humanize(b.remaining_payment_status)}
              />
              {/*
                The patient's own claim, when there is one. These were typed on
                `BookingWire` but only ever rendered in the verification queue,
                which meant an operator standing on this page had to go and
                find the other screen to see the reference they were being
                asked to match — and this card said "Deposit not yet paid"
                without mentioning that somebody had said otherwise.
              */}
              {b.deposit_manual_status && b.deposit_manual_status !== 'NONE' && (
                <>
                  <Separator />
                  <Field
                    label="Patient claim"
                    value={humanize(b.deposit_manual_status)}
                  />
                  <Field label="Sent via" value={humanize(b.deposit_manual_rail)} />
                  <Field
                    label="Claimed reference"
                    value={b.deposit_manual_reference}
                  />
                  <Field
                    label="Claimed at"
                    value={
                      b.deposit_manual_submitted_at
                        ? dateTime(b.deposit_manual_submitted_at)
                        : null
                    }
                  />
                </>
              )}
            </dl>
            {/*
              The action belongs to the money, not to the page. It was a header
              button competing with Invoice, Dispatch, Status and Cancel, which
              is four things too many for the one step that actually unblocks
              the booking.
            */}
            {showConfirmPayment && (
              <>
                <Separator className="my-4" />
                <DisabledWhenDenied
                  capability="bookings.confirmPayment"
                  reason="Confirming a payment needs finance write access. Ask an admin."
                >
                  <Button
                    className="w-full"
                    onClick={() => setConfirmPayOpen(true)}
                    disabled={confirmPayment.isPending}
                  >
                    {confirmPayment.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <BadgeCheck className="size-4" />
                    )}
                    Confirm deposit received ({money(depositAmount)})
                  </Button>
                </DisabledWhenDenied>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Assignment</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Doctor"
                value={b.assigned_doctor_name ?? 'Not assigned'}
              />
              <Field
                label="Nurse"
                value={b.assigned_nurse_name ?? 'Not assigned'}
              />
              <Field label="Acceptance" value={humanize(b.acceptance_status)} />
              <Field label="Type" value={humanize(b.assignment_type)} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-muted-foreground text-xs">
                Call summary (visible to the patient)
              </p>
              <p className="text-sm">{b.call_summary_notes || '—'}</p>
            </div>
            <Separator />
            <div>
              <p className="text-muted-foreground text-xs">
                Internal triage note
              </p>
              <p className="text-sm">{b.admin_note || '—'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Paperclip className="size-4" />
            Patient documents
          </CardTitle>
          <CardDescription>
            Links are signed and expire 30 minutes after this page loaded.
            Reload the page if a preview stops working.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!attachments.length ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <FileText className="size-4" />
              No documents were attached to this booking.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {attachments.map((doc, i) => (
                <div key={`${doc.url}-${i}`} className="space-y-2">
                  <p className="truncate text-sm font-medium">
                    {doc.name || `Document ${i + 1}`}
                  </p>
                  <DocumentPreview
                    url={doc.url}
                    mime={doc.mime}
                    name={doc.name}
                    className="h-72"
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <InvoiceDialog
        booking={b}
        open={invoiceOpen || autoAction === 'invoice'}
        onOpenChange={closeWith(setInvoiceOpen)}
      />
      <DispatchSheet
        booking={b}
        open={dispatchOpen || autoAction === 'assign'}
        onOpenChange={closeWith(setDispatchOpen)}
      />
      <StatusOverrideDialog
        booking={b}
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
      />
      {/*
        Confirmed behind a dialog rather than on the bare click the brief asked
        for. There is no un-confirm endpoint: this settles money, pushes
        "Payment verified" to the patient's phone, and opens dispatch. A
        misclick on a page the operator opened to read a condition note is not
        recoverable, and the Cancel action beside it already works this way.
      */}
      {/*
        Keyed on the quote so a re-priced booking re-seeds the amount field.
        The dialog prefills `amountPaid` from `quotedAmount` in `useState`,
        which only runs on mount — and this element is mounted unconditionally,
        so without the key an operator who edits the invoice and then opens
        this dialog sees the OLD figure, trips the mismatch guard, and gets a
        disabled submit with no way to tell why.
      */}
      <ConfirmPaymentDialog
        key={depositAmount}
        open={confirmPayOpen}
        onOpenChange={closeWith(setConfirmPayOpen)}
        quotedAmount={depositAmount}
        balanceDue={balanceDue}
        claimPending={claimPending}
        pending={confirmPayment.isPending}
        onConfirm={(body) => confirmPayment.mutateAsync(body)}
      />
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this booking?"
        description={
          <p>
            The patient is notified and every assigned provider is released.
            Any deposit already taken must be refunded separately.
          </p>
        }
        confirmLabel="Cancel booking"
        destructive
        onConfirm={async () => {
          await cancel.mutateAsync('Cancelled by operations');
        }}
      />
    </div>
  );
}
