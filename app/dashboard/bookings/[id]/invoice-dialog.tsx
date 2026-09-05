'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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
import { Textarea } from '@/components/ui/textarea';
import { setDeposit, setPrice } from '@/lib/api/bookings';
import { qk } from '@/lib/api/query-keys';
import { normalizeError } from '@/lib/api/errors';
import { money } from '@/lib/format';
import type { BookingWire } from '@/types/wire/booking';

/**
 * Invoice finalisation.
 *
 * There are two server endpoints behind one piece of UI, and which one applies
 * is decided by whether the deposit has been paid:
 *
 *   set-deposit  (PATCH)  before payment — quotes the fee AND the advance the
 *                         patient must pay to confirm. Writes the immutable
 *                         `deposit_quoted_amount`.
 *   set-price    (POST)   after payment — adjusts the final fee only; the
 *                         deposit is already banked and cannot move.
 *
 * The server enforces `fee − deposit − discount >= 0`; we check it here too so
 * the operator finds out while typing rather than after submitting.
 */
export function InvoiceDialog({
  booking,
  open,
  onOpenChange,
}: {
  booking: BookingWire;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const depositPaid = Boolean(booking.deposit_paid_at);

  const [fee, setFee] = useState(String(booking.final_price ?? booking.offered_budget ?? ''));
  const [deposit, setDepositValue] = useState(
    String(booking.required_deposit ?? booking.deposit_quoted_amount ?? ''),
  );
  const [discount, setDiscount] = useState(String(booking.adjusted_discount ?? ''));
  const [adminNote, setAdminNote] = useState(booking.admin_note ?? '');
  const [callNotes, setCallNotes] = useState(booking.call_summary_notes ?? '');

  const feeNum = Number(fee || 0);
  const depositNum = Number(deposit || 0);
  const discountNum = Number(discount || 0);
  const balance = feeNum - depositNum - discountNum;

  const invalid =
    feeNum <= 0 ||
    discountNum < 0 ||
    (!depositPaid && depositNum < 0) ||
    (!depositPaid && balance < 0);

  const save = useMutation({
    mutationFn: async () => {
      if (depositPaid) {
        return setPrice(booking.id, {
          final_service_fee: feeNum,
          adjusted_discount: discountNum,
          admin_note: adminNote,
          call_summary_notes: callNotes,
        });
      }
      return setDeposit(booking.id, {
        total_service_fee: feeNum,
        required_deposit: depositNum,
        adjusted_discount: discountNum,
        admin_note: adminNote,
        call_summary_notes: callNotes,
      });
    },
    onSuccess: () => {
      toast.success('Invoice updated.');
      queryClient.invalidateQueries({ queryKey: qk.booking(booking.id) });
      queryClient.invalidateQueries({ queryKey: qk.bookings });
      onOpenChange(false);
    },
    onError: (error) => toast.error(normalizeError(error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {depositPaid ? 'Adjust final invoice' : 'Set fee and advance deposit'}
          </DialogTitle>
          <DialogDescription>
            {depositPaid
              ? 'The deposit is already paid and cannot be changed. Only the final service fee and discount are editable.'
              : 'Quote the total service fee and the advance the patient must pay to confirm this visit.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fee">Total service fee</Label>
            <Input
              id="fee"
              type="number"
              min={1}
              inputMode="decimal"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="deposit">Required advance deposit</Label>
            <Input
              id="deposit"
              type="number"
              min={0}
              inputMode="decimal"
              value={deposit}
              onChange={(e) => setDepositValue(e.target.value)}
              disabled={depositPaid}
            />
            {depositPaid && (
              <p className="text-muted-foreground text-xs">
                Locked — {money(booking.deposit_amount)} was received on this
                booking.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="discount">Promotional discount</Label>
            <Input
              id="discount"
              type="number"
              min={0}
              inputMode="decimal"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </div>

          <Alert>
            <AlertDescription className="flex items-center justify-between">
              <span>Balance due after deposit and discount</span>
              <span
                className={`font-semibold tabular-nums ${balance < 0 ? 'text-destructive' : ''}`}
              >
                {money(balance)}
              </span>
            </AlertDescription>
          </Alert>
          {balance < 0 && !depositPaid && (
            <p className="text-destructive text-sm">
              The deposit and discount together exceed the fee. The server will
              reject this.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="call-notes">Call summary / operations notes</Label>
            <Textarea
              id="call-notes"
              rows={3}
              value={callNotes}
              onChange={(e) => setCallNotes(e.target.value)}
              placeholder="What was agreed on the call with the patient…"
            />
            {/* This distinction matters and is invisible from the field names
                alone: call_summary_notes renders in the patient's app as
                "Note from Operations". admin_note never leaves this console. */}
            <p className="text-muted-foreground text-xs">
              <strong>Visible to the patient</strong> in their booking timeline.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="admin-note">Internal triage note</Label>
            <Textarea
              id="admin-note"
              rows={2}
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              placeholder="Context for other operators…"
            />
            <p className="text-muted-foreground text-xs">
              Internal only — never shown to the patient.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={invalid || save.isPending}
          >
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            Save invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
