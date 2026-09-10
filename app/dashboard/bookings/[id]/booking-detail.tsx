'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BadgeCheck,
  Download,
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
import { bookingRef, dateTime, fileSize, humanize, money } from '@/lib/format';
import { TERMINAL_STATUSES } from '@/types/wire/booking';
import { PatientContactActions } from '@/components/bookings/patient-contact-actions';
/**
 * The itemized editor SUPERSEDES the old flat `invoice-dialog.tsx`, which is
 * gone. It is a strict superset: a single-service booking is one line, the flat
 * waiver is the `৳` mode on the discount control, and the same handler quotes
 * an advance or corrects an already-paid invoice — so keeping both would have
 * meant two buttons doing one job with different vocabularies.
 */
import { InvoiceEditor } from './invoice-editor';
import { DispatchSheet } from './dispatch-sheet';
import { ConfirmPaymentDialog } from './confirm-payment-dialog';
import { StatusOverrideDialog } from './status-override';
import { MobileActionBar } from './mobile-action-bar';

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
  /**
   * `attachments` is the ONLY array on the wire. The old fallback to
   * `b.documents` could never fire — `withAttachments` deletes that key
   * server-side before the payload is sent — and reading it here made the
   * mapping bug below look like a missing-data problem rather than a
   * wrong-field one.
   */
  const attachments = b.attachments ?? [];

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
   * Terminal — the visit is over and its money can no longer move. Every write
   * control on this page is refused server-side from here on, and the Money
   * card's job changes from "what should this cost?" to "what did it cost?".
   */
  const closed = (TERMINAL_STATUSES as readonly string[]).includes(b.status);

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
    // The bottom padding clears the fixed mobile action bar at the end of this
    // file. Without it the last card's own actions sit underneath it.
    <div className="space-y-6 max-md:pb-20">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/dashboard/bookings">
          <ArrowLeft className="size-4" />
          All bookings
        </Link>
      </Button>

      <PageHeader
        title={b.patient_name}
        description={`#${bookingRef(b.id)} · ${b.care_type}${b.area ? ` · ${b.area}` : ''}`}
        actions={
          <>
            {/*
              On a CLOSED booking the invoice is a record, and the archive is
              where records are read and printed. Sending the operator there
              rather than into a dialog that can only say "locked" saves the
              round trip; the dialog still handles the case where they arrive
              from a deep link.
            */}
            {closed ? (
              <Button variant="outline" asChild>
                <Link href={`/dashboard/bookings/history/${b.id}`}>
                  <Receipt className="size-4" />
                  Receipt
                </Link>
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setInvoiceOpen(true)}>
                <Receipt className="size-4" />
                Invoice
              </Button>
            )}
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
              <Field
                label="Patient phone"
                value={
                  <PatientContactActions
                    bookingId={b.id}
                    phone={b.patient_phone}
                    patientName={b.patient_name}
                    serviceName={b.care_type}
                  />
                }
              />
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
              {/*
                "Only the final fee can change" is true of a booking in flight
                and false of a closed one, where nothing can. Saying it anyway
                is how an operator ends up trying an edit the server refuses.
              */}
              {closed
                ? 'This booking is closed — its invoice is final. Open the receipt to read or print it.'
                : b.deposit_paid_at
                  ? 'Deposit settled — only the final fee can change.'
                  : 'Deposit not yet paid.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/*
              The itemized ledger, shown only when an operator actually built
              one. `is_itemized` is the server's answer to that question —
              `line_items` is never empty on the wire, because a booking priced
              through the flat path gets a single synthesised line so the
              patient app always has something to render. Keying the section on
              the array's length instead would print a one-row "breakdown" that
              only restates the fee field two lines below it.
            */}
            {b.is_itemized && (b.line_items?.length ?? 0) > 0 && (
              <div className="mb-4 space-y-1.5 text-sm">
                {b.line_items!.map((li, i) => (
                  <div
                    key={`${li.item_type}-${li.item_id ?? i}-${li.title}`}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="text-muted-foreground min-w-0 truncate">
                      {li.title}
                      {li.quantity !== 1 && (
                        <span className="ml-1 tabular-nums">
                          × {li.quantity}
                          {li.unit ? ` ${li.unit}` : ''}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {money(li.total_price)}
                    </span>
                  </div>
                ))}
                <Separator className="my-2" />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular-nums">{money(b.subtotal)}</span>
                </div>
              </div>
            )}
            <dl className="space-y-3">
              <Field label="Patient offer" value={money(b.offered_budget)} />
              <Field label="Final service fee" value={money(b.final_price)} />
              <Field
                label="Required deposit"
                value={money(b.required_deposit ?? b.deposit_quoted_amount)}
              />
              <Field
                label="Discount"
                /* Name the percentage when there was one. "৳786" alone leaves
                   an operator reconciling a patient's query unable to tell a
                   30% promotion from a negotiated waiver that happened to land
                   on the same figure. */
                value={
                  Number(b.discount_percentage ?? 0) > 0
                    ? `${money(b.adjusted_discount)} (${b.discount_percentage}%)`
                    : money(b.adjusted_discount)
                }
              />
              {/*
                What the visit still owes once the deposit and the discount come
                off — the figure the clinician collects at the door, and the one
                an operator is asked for on the phone. It was computed in this
                component already (for the confirm dialog) and never shown, so
                the card printed the three inputs to the subtraction and left the
                answer to be done in someone's head.

                `null` when nothing has been priced yet, and the row is dropped
                rather than rendered as ৳0: "nothing left to pay" and "nobody has
                quoted this" are different answers.
              */}
              {balanceDue !== null && (
                <Field
                  label="Balance due after visit"
                  value={
                    b.final_paid_at ? 'Paid in full' : money(balanceDue)
                  }
                />
              )}
              <Separator />
              <Field
                label="Deposit paid"
                value={b.deposit_paid_at ? dateTime(b.deposit_paid_at) : 'No'}
              />
              {/*
                THE DEPOSIT's verification posture, which "Deposit paid: No" on
                its own does not give an operator. `deposit_status` is the
                server's single witness (backend/src/utils/depositPosture.js):
                PENDING while it is owed, PENDING_VERIFICATION once the patient
                says they have sent it, CONFIRMED once this page's own button
                has settled it. The row below it, "Balance verification", is the
                BALANCE's equivalent and answers a different question.
              */}
              <Field
                label="Deposit verification"
                value={humanize(b.deposit_status)}
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
              {/*
                `file_url` / `file_type` / `file_name` are the server's names for
                these (see `BookingAttachmentWire`). This card read `url` / `mime`
                / `name` — the shape of the RAW subdocument, which never reaches a
                browser — so every field was `undefined`, `DocumentPreview` took
                its empty-url branch, and a booking with a discharge summary and
                two lab reports rendered three "No file attached" tiles.
              */}
              {attachments.map((doc, i) => (
                <div key={doc.id ?? `${doc.file_url}-${i}`} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-sm font-medium">
                      {doc.file_name || `Document ${i + 1}`}
                    </p>
                    {doc.size_bytes ? (
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {fileSize(doc.size_bytes)}
                      </span>
                    ) : null}
                  </div>
                  <DocumentPreview
                    url={doc.file_url}
                    mime={doc.file_type}
                    name={doc.file_name}
                    className="h-72"
                  />
                  {/*
                    A SAVE, not a second preview. `download_url` is the same
                    grant with `?download=1`, which makes the delivery route send
                    Content-Disposition — the difference between a PDF a reviewer
                    can attach to a case note and one that opens in a tab they
                    then have to print. `download` alone would not do it: the
                    bytes come from the API's origin, not this one.
                  */}
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={doc.download_url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      <Download className="size-3.5" />
                      Download
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <InvoiceEditor
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
      <MobileActionBar
        booking={b}
        closed={closed}
        showConfirmPayment={showConfirmPayment}
        depositAmount={depositAmount}
        onInvoice={() => setInvoiceOpen(true)}
        onConfirmPayment={() => setConfirmPayOpen(true)}
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
