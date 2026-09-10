'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, MessageCircle, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  bookingRef,
  bookingWhatsAppMessage,
  bookingWhatsAppUrl,
  formatForWhatsApp,
  isDialable,
} from '@/lib/format';
import type { ManualBookingResult } from '@/lib/api/bookings';

/**
 * What happens in the seconds after a manual booking is created, while the
 * patient is still on the phone.
 *
 * Two jobs, and both are one-shot:
 *
 *   1. If this call also minted an account, the temporary password exists here
 *      and NOWHERE ELSE — it is stored only as a hash. The operator has to read
 *      it out before hanging up, so the dialog refuses to close by Escape or an
 *      overlay click and gates its exit on an explicit acknowledgement.
 *   2. The WhatsApp hand-off. The patient has just agreed to a fee over the
 *      phone and has nothing in writing; this puts the reference, the total and
 *      what they owe into a thread they keep.
 *
 * The message is built from the CREATED booking's own fields rather than from
 * the form's state, so what the patient reads is what the server stored. A
 * discount the server recomputed, or a deposit it rounded, reaches the patient
 * as the server's figure and not the console's.
 */
export function BookingCreatedDialog({
  booking,
  patientName,
  patientPhone,
  doctorName,
  onClose,
}: {
  booking: ManualBookingResult | null;
  patientName: string;
  patientPhone: string;
  doctorName: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [sent, setSent] = useState(false);

  if (!booking) return null;

  const temporaryPassword = booking.temporaryPassword;
  // The deposit is settled when the server says so, read from the settlement
  // stamp rather than from what the operator ticked — those agree, and when
  // they do not it is the server that is right.
  const depositPaid =
    Boolean(booking.deposit_paid_at) || Number(booking.deposit_amount ?? 0) > 0;
  const depositDue = depositPaid ? 0 : Number(booking.required_deposit ?? 0);
  const total = Number(booking.final_price ?? 0);

  const message = bookingWhatsAppMessage({
    patientName,
    bookingId: booking.id,
    totalAmount: total,
    depositDue,
    depositPaid,
    doctorName,
  });
  const canWhatsApp = isDialable(patientPhone);
  const waUrl = bookingWhatsAppUrl(formatForWhatsApp(patientPhone), message);

  async function copyPassword() {
    if (!temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — read it from the screen instead.');
    }
  }

  // Closing is only gated while a credential is on screen. Without one there is
  // nothing here that cannot be recovered from the booking page.
  const mustAcknowledge = Boolean(temporaryPassword) && !acknowledged;

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-h-[92vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>Booking #{bookingRef(booking.id)} created</DialogTitle>
          <DialogDescription>
            {depositPaid
              ? 'The deposit is recorded as collected, so the booking is confirmed and ready for dispatch.'
              : 'The patient owes the deposit. It appears in their app as an itemized invoice with a payment button.'}
          </DialogDescription>
        </DialogHeader>

        {temporaryPassword && (
          <>
            <Alert>
              <TriangleAlert className="size-4" />
              <AlertTitle>Temporary password — shown once</AlertTitle>
              <AlertDescription>
                This number had no account, so one was created. Read the
                password to the patient before hanging up. It is not stored
                anywhere in readable form; if you lose it, the account has to be
                reset.
              </AlertDescription>
            </Alert>

            <div className="flex items-center gap-2 rounded-md border p-3">
              <code className="flex-1 font-mono text-sm break-all">
                {temporaryPassword}
              </code>
              <Button size="icon" variant="ghost" onClick={copyPassword}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="mb-ack"
                checked={acknowledged}
                onCheckedChange={(v) => setAcknowledged(v === true)}
              />
              <Label htmlFor="mb-ack" className="font-normal">
                I have passed this password on
              </Label>
            </div>

            <Separator />
          </>
        )}

        <div className="space-y-2">
          <Label>Send the details on WhatsApp</Label>
          {/*
            The message is shown before it is sent, not after. The operator is
            the one who negotiated these numbers and is the last check on them
            — and once WhatsApp opens, the text is out of this console's hands.
          */}
          <p className="text-muted-foreground bg-muted/50 rounded-md border p-3 text-xs leading-relaxed">
            {message}
          </p>
          {canWhatsApp ? (
            <Button asChild variant="outline" className="w-full">
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setSent(true)}
              >
                {/*
                  Lucide carries no WhatsApp mark — brand glyphs were dropped
                  from the set — and shipping a hand-rolled one would put Meta's
                  trademark in our bundle. The generic bubble beside the word
                  says the same thing.
                */}
                <MessageCircle />
                {sent ? 'Open WhatsApp again' : 'Send details via WhatsApp'}
              </a>
            </Button>
          ) : (
            <p className="text-muted-foreground text-xs">
              This patient has no usable phone number on file, so there is
              nothing to open a chat with.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={mustAcknowledge}
            onClick={onClose}
          >
            Create another
          </Button>
          <Button
            disabled={mustAcknowledge}
            onClick={() => router.push(`/dashboard/bookings/${booking.id}`)}
          >
            Open the booking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
