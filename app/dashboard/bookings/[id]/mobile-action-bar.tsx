'use client';

import Link from 'next/link';
import { BadgeCheck, Receipt } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DisabledWhenDenied } from '@/components/rbac/can';
import { PatientContactActions } from '@/components/bookings/patient-contact-actions';
import { money } from '@/lib/format';
import type { BookingWire } from '@/types/wire/booking';

/**
 * The three things an operator does from a booking on a phone, pinned to the
 * bottom of the screen.
 *
 * ## Why it is not just the header buttons
 *
 * The detail screen's header carries five actions — Invoice, Dispatch, Status,
 * Cancel and, on the Money card, Confirm deposit. On a desktop they are all
 * above the fold. On a phone the header scrolls away within a swipe, and the
 * Confirm-deposit button is roughly a screen and a half down, below twenty
 * fields. So the actions that are actually URGENT get a second, permanent home:
 * ringing the patient, messaging them, and whichever single write is the
 * booking's real next step.
 *
 * ## Why `fixed` and not `sticky`
 *
 * A sticky element only travels inside its containing block, and this bar is
 * the last child of the page — there is nothing below its natural position for
 * it to stick over, so `sticky bottom-0` would pin it precisely where it
 * already sits and reveal it only once the page is scrolled to the end. `fixed`
 * is what "always on screen" means. The page pays for it with bottom padding
 * (`max-md:pb-20` on the detail root) so the last card is not covered.
 *
 * ## Which write it offers
 *
 * ONE, chosen by the booking's own state, because a bar of four buttons on a
 * 360px screen is four buttons nobody can hit:
 *
 * - money outstanding → confirm the deposit, which is what unblocks dispatch;
 * - booking closed → the receipt, since nothing else can still be written;
 * - otherwise → the invoice, which is the step everything else waits on.
 */
export function MobileActionBar({
  booking,
  showConfirmPayment,
  depositAmount,
  onInvoice,
  onConfirmPayment,
  closed,
}: {
  booking: BookingWire;
  showConfirmPayment: boolean;
  depositAmount: number;
  onInvoice: () => void;
  onConfirmPayment: () => void;
  closed: boolean;
}) {
  return (
    <div
      className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t px-3 pt-2 pb-safe-4 backdrop-blur md:hidden [&>*]:flex-1"
      // The bar duplicates controls that already exist further up the page, so
      // it is a convenience layer rather than a landmark of its own.
      aria-label="Quick actions"
    >
      {/*
        The same `usePatientContact` links the phone field uses, so the number
        dialled and the WhatsApp text sent are identical whichever control the
        operator reaches for. `inline` renders the two buttons bare, which is
        what lets `[&>*]:flex-1` above give all three an equal share.
      */}
      <PatientContactActions
        layout="inline"
        bookingId={booking.id}
        phone={booking.patient_phone}
        patientName={booking.patient_name}
        serviceName={booking.care_type}
      />

      {closed ? (
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/bookings/history/${booking.id}`}>
            <Receipt />
            Receipt
          </Link>
        </Button>
      ) : showConfirmPayment ? (
        <DisabledWhenDenied
          capability="bookings.confirmPayment"
          reason="Confirming a payment needs finance write access. Ask an admin."
        >
          <Button size="sm" onClick={onConfirmPayment} className="w-full">
            <BadgeCheck />
            {/* The figure, not the word "deposit". This settles money and
                cannot be undone from the console, so the amount being
                confirmed belongs on the button that confirms it. */}
            {money(depositAmount)}
          </Button>
        </DisabledWhenDenied>
      ) : (
        <Button size="sm" onClick={onInvoice}>
          <Receipt />
          Invoice
        </Button>
      )}
    </div>
  );
}
