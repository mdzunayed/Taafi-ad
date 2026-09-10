/**
 * The message an operator sends a patient the moment their booking is created.
 *
 * A PURE function with no React and no network, because it is the part worth
 * getting exactly right: it quotes money and a reference number to a patient,
 * and every figure in it has to be the one the server actually stored, not the
 * one the form was showing. The caller passes the created booking's own fields.
 *
 * Composed rather than templated so the sentences that do not apply are absent
 * rather than empty. A patient whose deposit the operator already took in cash
 * must not be asked to pay one — that is not a cosmetic difference, it is the
 * difference between a receipt and a second demand for money.
 */

import { money } from './index';
import { bookingRef } from './phone';

/**
 * Where the patient goes to pay.
 *
 * There is no patient-facing web checkout on this platform — the app IS the
 * payment surface — so this is a link to the app, and it is CONFIGURED rather
 * than hardcoded because it differs per deployment (a store listing, a landing
 * page, a dynamic link). Unset, the sentence is simply omitted: a message that
 * points a patient at a dead URL is worse than one that tells them to open the
 * app they already have.
 */
const PATIENT_APP_URL = (process.env.NEXT_PUBLIC_PATIENT_APP_URL ?? '').trim();

export interface BookingMessageInput {
  patientName: string | null | undefined;
  bookingId: string;
  /** The PRE-discount total, as stored. */
  totalAmount: number | null | undefined;
  /** What the patient owes to confirm, or 0 once it is settled. */
  depositDue: number | null | undefined;
  /** True when the operator already took the deposit. */
  depositPaid: boolean;
  /** The dispatched clinician, when one was assigned in the same call. */
  doctorName?: string | null;
}

export function bookingWhatsAppMessage(input: BookingMessageInput): string {
  const ref = bookingRef(input.bookingId);
  const name = (input.patientName ?? '').trim() || 'there';
  const lines: string[] = [
    `Hello ${name}, your care request (#${ref}) has been booked by Taafi Admin.`,
  ];

  if (input.totalAmount != null && input.totalAmount > 0) {
    lines.push(`Total fee: ${money(input.totalAmount)}.`);
  }

  if (input.depositPaid) {
    // A receipt, not a demand. The patient handed over money a minute ago and
    // the first thing they read has to acknowledge it.
    lines.push('Your deposit has been received — no payment is due right now.');
    if (input.doctorName) {
      lines.push(`${input.doctorName} has been assigned to your visit.`);
    }
    lines.push('You can track your visit in the Taafi app.');
  } else if (input.depositDue != null && input.depositDue > 0) {
    lines.push(
      `Deposit due to confirm your visit: ${money(input.depositDue)}.`,
    );
    lines.push(
      PATIENT_APP_URL
        ? `Open the Taafi app to see the full invoice and pay: ${PATIENT_APP_URL}`
        : 'Open the Taafi app to see the full invoice and pay your deposit.',
    );
  } else {
    // Unpriced. The review call has not happened, so promising a figure or a
    // payment link would be inventing both.
    lines.push(
      'Our care team will call you shortly to confirm the details and the fee.',
    );
  }

  return lines.join(' ');
}

/** `wa.me` deep link carrying the message above, ready for an anchor href. */
export function bookingWhatsAppUrl(
  phoneDigits: string,
  message: string,
): string {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
}
