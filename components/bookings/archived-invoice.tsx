'use client';

import { useState } from 'react';
import { Loader2, Lock, Printer, Receipt } from 'lucide-react';
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
import { fetchReceiptPdf } from '@/lib/api/bookings';
import { normalizeError } from '@/lib/api/errors';
import { bookingRef, dateTime, money } from '@/lib/format';
import type {
  BookingInvoiceWire,
  BookingLineItemWire,
} from '@/types/wire/booking';

/**
 * THE archived invoice, read-only.
 *
 * ## Why it is a different component from the Money card
 *
 * The Money card on an in-flight booking is a WORKSPACE: it shows the three
 * inputs an operator is still deciding between and puts an Invoice button next
 * to them. This is a RECORD. Nothing on it is editable, nothing recomputes,
 * and it renders the figures a patient has already been shown on their phone —
 * the same `invoice` object, off the same wire. An operator taking a billing
 * call needs to be looking at exactly what the caller is looking at, and the
 * fastest way to guarantee that is to render the same object rather than a
 * console-flavoured version of it.
 *
 * The lock is enforced server-side too: `setBookingInvoice`'s INVOICEABLE list
 * excludes every terminal status, so a console that offered an edit here would
 * be offering a 409. The read-only presentation is what makes that legible
 * BEFORE someone tries.
 */
export function ArchivedInvoice({
  bookingId,
  invoice,
  patientName,
}: {
  bookingId: string;
  invoice: BookingInvoiceWire;
  patientName?: string;
}) {
  const depositOnly = invoice.kind === 'DEPOSIT_RECEIPT';
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Receipt className="size-4" />
              {depositOnly ? 'Deposit receipt' : 'Final invoice'}
            </CardTitle>
            <CardDescription>
              Receipt No. {bookingRef(bookingId)}
              {invoice.finalized_at
                ? ` · frozen ${dateTime(invoice.finalized_at)}`
                : ''}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {/*
              Says WHY the fields below have no edit controls. An operator who
              cannot find the Invoice button assumes a permissions problem and
              opens a ticket; a badge that names the reason ends that in one
              glance.
            */}
            <Badge variant="outline" className="gap-1">
              <Lock className="size-3" />
              Locked
            </Badge>
            <PrintReceiptButton bookingId={bookingId} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {depositOnly && (
          <p className="text-muted-foreground bg-muted/50 rounded-md p-3 text-sm">
            This visit was cancelled. The lines below are what was quoted; only
            the advance already paid was charged, and nothing further is owed.
          </p>
        )}

        <LedgerSection title="Services" items={invoice.services} />
        <LedgerSection
          title="Medicines & supplies"
          items={invoice.supplies}
        />
        <LedgerSection title="Other charges" items={invoice.other_charges} />

        <Separator />

        <dl className="space-y-2 text-sm">
          <TotalRow label="Subtotal" value={money(invoice.subtotal)} />
          {invoice.discount_amount > 0 && (
            <TotalRow
              /* Name the percentage when there was one. "৳786" alone leaves an
                 operator reconciling a patient's query unable to tell a 30%
                 promotion from a negotiated waiver that landed on the same
                 figure. */
              label={
                invoice.discount_percentage > 0
                  ? `Discount (${invoice.discount_percentage}%)`
                  : 'Discount applied'
              }
              value={`- ${money(invoice.discount_amount)}`}
            />
          )}
          <TotalRow label="Total payable" value={money(invoice.total_payable)} />
          <Separator className="my-1" />
          <TotalRow
            label="Advance deposit paid"
            value={money(invoice.deposit_paid)}
            hint={
              invoice.deposit_paid_at ? dateTime(invoice.deposit_paid_at) : null
            }
          />
          <TotalRow
            label="Balance paid"
            value={money(invoice.balance_paid)}
            hint={
              invoice.balance_paid_at ? dateTime(invoice.balance_paid_at) : null
            }
          />
          {/*
            Shown only when something is genuinely still owed. A "৳0
            outstanding" row on a settled receipt invites the question it
            exists to answer.
          */}
          {invoice.amount_outstanding > 0 && (
            <TotalRow
              label="Outstanding"
              value={money(invoice.amount_outstanding)}
              tone="warn"
            />
          )}
          <Separator className="my-1" />
          <TotalRow
            label="Total paid"
            value={money(invoice.total_paid)}
            emphasize
          />
        </dl>

        <PaymentRails invoice={invoice} />

        {invoice.call_summary_notes && (
          <div className="rounded-md border p-3">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Note from operations
            </p>
            <p className="mt-1 text-sm">{invoice.call_summary_notes}</p>
          </div>
        )}

        {patientName && (
          <p className="text-muted-foreground text-xs">
            Issued to {patientName}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** One titled group of charges. Renders nothing when the group is empty. */
function LedgerSection({
  title,
  items,
}: {
  title: string;
  items: BookingLineItemWire[];
}) {
  if (!items?.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {title}
      </p>
      {items.map((li, i) => (
        <div
          key={`${li.item_type}-${li.item_id ?? i}-${li.title}`}
          className="flex items-baseline justify-between gap-3 text-sm"
        >
          <span className="min-w-0 truncate">
            {li.title}
            {li.quantity !== 1 && (
              <span className="text-muted-foreground ml-1 tabular-nums">
                × {li.quantity}
                {li.unit ? ` ${li.unit}` : ''}
              </span>
            )}
            <span className="text-muted-foreground ml-2 tabular-nums">
              @ {money(li.unit_price)}
            </span>
          </span>
          <span className="shrink-0 tabular-nums">{money(li.total_price)}</span>
        </div>
      ))}
    </div>
  );
}

function TotalRow({
  label,
  value,
  hint,
  emphasize = false,
  tone,
}: {
  label: string;
  value: string;
  hint?: string | null;
  emphasize?: boolean;
  tone?: 'warn';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt
        className={
          emphasize ? 'font-semibold' : 'text-muted-foreground min-w-0 truncate'
        }
      >
        {label}
        {hint && (
          <span className="text-muted-foreground ml-2 text-xs">{hint}</span>
        )}
      </dt>
      <dd
        className={[
          'shrink-0 tabular-nums',
          emphasize ? 'text-base font-semibold' : '',
          tone === 'warn' ? 'text-destructive' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * The rail the money actually arrived on.
 *
 * `payment_method_label` is the SERVER's word for it. The console must not
 * derive this from the booking's `payment_channel`, which carries the
 * normalized ONLINE|CASH posture by the time it reaches here — a receipt that
 * badged cash a clinician counted at a patient's door as "Online" would be
 * wrong in the one place it must not be.
 *
 * Both legs are printed when they differ, because a single badge would then be
 * a lie about one of them.
 */
function PaymentRails({ invoice }: { invoice: BookingInvoiceWire }) {
  const deposit = invoice.deposit_method_label;
  const balance = invoice.balance_method_label;
  const split = deposit && balance && deposit !== balance;
  const single = invoice.payment_method_label;
  if (!single && !deposit && !balance) return null;

  const reference =
    invoice.balance_transaction_id ?? invoice.deposit_transaction_id;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {split ? (
        <>
          <Badge variant="secondary">Advance · {deposit}</Badge>
          <Badge variant="secondary">Balance · {balance}</Badge>
        </>
      ) : (
        <Badge variant="secondary">Paid via {single ?? deposit ?? balance}</Badge>
      )}
      {reference && (
        <span className="text-muted-foreground font-mono text-xs">
          Ref {reference}
        </span>
      )}
    </div>
  );
}

/**
 * Print / download, from one fetch.
 *
 * The PDF endpoint needs an `Authorization` header, so a plain `<a href>`
 * cannot reach it — the bytes come through the same axios client every other
 * call uses, and the object URL minted from them is revoked once the browser
 * has had it. Opening in a new tab rather than forcing a save gives the
 * operator the browser's own viewer, which is where the Print button they were
 * actually looking for lives.
 */
function PrintReceiptButton({ bookingId }: { bookingId: string }) {
  const [busy, setBusy] = useState(false);

  async function open() {
    if (busy) return;
    setBusy(true);
    let url: string | null = null;
    try {
      const blob = await fetchReceiptPdf(bookingId);
      url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (!win) {
        // Pop-up blocked. Fall back to a click-driven download, which browsers
        // allow from the same gesture — losing the print preview but not the
        // receipt.
        const a = document.createElement('a');
        a.href = url;
        a.download = `Taafi_Receipt_${bookingRef(bookingId)}.pdf`;
        a.click();
      }
    } catch (error) {
      toast.error(normalizeError(error).message);
    } finally {
      setBusy(false);
      // Revoked on a timer rather than immediately: the new tab has to finish
      // reading the blob, and revoking in the same tick leaves it blank.
      const created = url;
      if (created) setTimeout(() => URL.revokeObjectURL(created), 60_000);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={open} disabled={busy}>
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Printer className="size-4" />
      )}
      Print / Download Receipt
    </Button>
  );
}
