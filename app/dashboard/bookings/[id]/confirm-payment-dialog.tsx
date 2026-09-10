'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { money } from '@/lib/format';
import type { ConfirmPaymentBody } from '@/lib/api/bookings';

/**
 * Record money that arrived out of band, with nobody but the operator to
 * witness it.
 *
 * This used to be a bare "are you sure?" that posted an EMPTY body: the server
 * settled the quote and no record survived of what the admin actually saw or
 * which transfer it was. Reconciling a disputed booking a week later meant
 * reading the merchant statement and guessing.
 *
 * So the form asks for the two facts only the operator has — the amount on the
 * receipt and its reference — and sends them. The amount is a CROSS-CHECK, not
 * an override: the server settles the booking's quote either way and answers
 * 409 when the two disagree, which is what turns a typo into a question rather
 * than a silent mis-billing.
 */
export function ConfirmPaymentDialog({
  open,
  onOpenChange,
  quotedAmount,
  balanceDue,
  claimPending,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What this booking was quoted. The figure the server will settle. */
  quotedAmount: number;
  /** Fee minus deposit minus discount, or null when no fee is set yet. */
  balanceDue: number | null;
  /** The patient filed a reference of their own — the queue is the better tool. */
  claimPending: boolean;
  pending: boolean;
  onConfirm: (body: ConfirmPaymentBody) => Promise<unknown>;
}) {
  /*
   * Prefilled with the quote, because agreeing with it is the overwhelmingly
   * common case and retyping a number you are only being asked to confirm is
   * how transcription errors get made. Kept as a string so the field can be
   * cleared without becoming NaN.
   */
  const [amountPaid, setAmountPaid] = useState(String(quotedAmount));
  const [transactionRef, setTransactionRef] = useState('');
  const [note, setNote] = useState('');
  const [paymentType, setPaymentType] =
    useState<NonNullable<ConfirmPaymentBody['paymentType']>>('DEPOSIT');

  const amount = Number(amountPaid);
  const amountValid = amountPaid.trim() !== '' && Number.isFinite(amount);
  // Mirrors the server's own guard so the operator sees the problem before the
  // round trip, not as a toast after it.
  const mismatch = amountValid && amount !== quotedAmount;

  const submit = async () => {
    await onConfirm({
      paymentType,
      amountPaid: amount,
      transactionRef: transactionRef.trim() || undefined,
      note: note.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileFullscreen className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirm {money(quotedAmount)} received?</DialogTitle>
          <DialogDescription>
            Only do this with the credit in front of you. The booking moves to
            awaiting dispatch, the patient is told their payment was verified,
            and this cannot be undone from the console.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {claimPending && (
            <Alert>
              <AlertDescription>
                This patient submitted a transaction reference. Payment
                verification shows it next to the amount, which is the safer
                place to match it against the statement.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="cp-type">What arrived</Label>
            <Select
              value={paymentType}
              onValueChange={(v) =>
                setPaymentType(v as NonNullable<ConfirmPaymentBody['paymentType']>)
              }
            >
              <SelectTrigger id="cp-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DEPOSIT">Advance deposit only</SelectItem>
                <SelectItem value="FULL">The full fee</SelectItem>
              </SelectContent>
            </Select>
            {paymentType === 'FULL' && (
              <p className="text-muted-foreground text-xs">
                Settles the balance as well and unlocks this visit&rsquo;s
                prescriptions.
                {balanceDue !== null && balanceDue > 0
                  ? ` The outstanding balance is ${money(balanceDue)}.`
                  : ''}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="cp-amount">Amount on the receipt</Label>
            <Input
              id="cp-amount"
              type="number"
              inputMode="decimal"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
            />
            {mismatch ? (
              <Alert variant="destructive">
                <AlertDescription>
                  This booking was quoted {money(quotedAmount)}. Re-check the
                  receipt, or change the quote on the invoice first — the server
                  will refuse a figure that disagrees with the quote.
                </AlertDescription>
              </Alert>
            ) : (
              <p className="text-muted-foreground text-xs">
                Must match the {money(quotedAmount)} quoted on the invoice.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="cp-ref">Transaction reference</Label>
            <Input
              id="cp-ref"
              value={transactionRef}
              onChange={(e) => setTransactionRef(e.target.value)}
              placeholder="bKash TrxID, bank reference…"
            />
            <p className="text-muted-foreground text-xs">
              Optional, but it is what makes this settlement traceable in the
              statement later.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cp-note">Internal note</Label>
            <Textarea
              id="cp-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Not shown to the patient."
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !amountValid || mismatch}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Confirm payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
