'use client';

import { useMutation } from '@tanstack/react-query';
import { MessageCircle, Phone } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { logContactAttempt, type ContactChannel } from '@/lib/api/bookings';
import { bookingRef, formatForTel, formatForWhatsApp, isDialable } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface PatientContact {
  bookingId: string;
  phone: string | null | undefined;
  patientName: string | null | undefined;
  serviceName: string | null | undefined;
}

/**
 * The two hand-offs an operator makes on a booking, as data rather than as
 * markup.
 *
 * Split out from the buttons below because three surfaces now need the same
 * pair of URLs and the same audit call — the detail page's phone field, a row
 * in the mobile bookings list, and the sticky action bar at the bottom of the
 * detail screen — and a second hand-rolled `wa.me` template is exactly how the
 * message a patient receives starts drifting between screens.
 */
export function usePatientContact({
  bookingId,
  phone,
  patientName,
  serviceName,
}: PatientContact) {
  /**
   * FIRE AND FORGET, by the same contract as the server-side audit helper it
   * feeds (`backend/src/utils/auditLog.js`): a lost log line is bad, a toast
   * fired at an operator who is already mid-dial is worse, and neither may
   * stand between the click and the anchor. The click handler never awaits
   * this and the browser follows the href regardless of what it does.
   */
  const logAttempt = useMutation({
    mutationFn: (channel: ContactChannel) => logContactAttempt(bookingId, channel),
    onError: (error) => console.warn('[contact-attempt] not recorded', error),
  });

  const dialable = isDialable(phone);
  const ref = bookingRef(bookingId);
  const message =
    `Hello ${patientName ?? 'there'}, this is the Taafi Care Team calling regarding ` +
    `your request for ${serviceName ?? 'home care'} (Booking ID: #${ref}). ` +
    `We would like to confirm your details.`;

  return {
    /** False for a blank or junk number — render the field, not a dead link. */
    dialable,
    telHref: `tel:${formatForTel(phone)}`,
    waHref: `https://wa.me/${formatForWhatsApp(phone)}?text=${encodeURIComponent(message)}`,
    onCall: () => logAttempt.mutate('call'),
    onWhatsApp: () => logAttempt.mutate('whatsapp'),
  };
}

/**
 * What the operator opening a booking is usually about to do: ring the patient
 * or start a WhatsApp thread with them.
 *
 * Before this, the phone number was text. Reaching a patient meant selecting
 * eleven digits, deciding whether the softphone wanted the `01…` or the `+880…`
 * form, and — for WhatsApp — retyping the number into a `wa.me` URL with the
 * leading zero swapped for the country code by hand. Two links remove a
 * transcription step from the one workflow that happens on every single
 * booking, and a mistyped digit here is a call to a stranger.
 *
 * `layout` picks which of the two shapes is wanted:
 *
 * - `field` — the number above its two buttons, for a definition list.
 * - `inline` — the two buttons and NOTHING ELSE: no wrapper, no number. They
 *   land as direct children of whatever flex row asked for them, which is the
 *   only way a card footer's `*:flex-1` can reach them and give `[ Call ]`,
 *   `[ WhatsApp ]` and `[ View details ]` an equal third of the width each. A
 *   wrapper here would collapse the first two into one third between them.
 *
 * `inline` on an undialable number renders nothing rather than the fallback
 * text: the caller is a row of buttons, and the number itself is already
 * printed in the card body above it.
 */
export function PatientContactActions({
  layout = 'field',
  className,
  ...contact
}: PatientContact & {
  layout?: 'field' | 'inline';
  /** Applies to the `field` layout's wrapper. `inline` has no wrapper. */
  className?: string;
}) {
  const { dialable, telHref, waHref, onCall, onWhatsApp } =
    usePatientContact(contact);

  if (!dialable) {
    // A blank or junk number renders as the plain field it was, rather than as
    // two buttons that would open a dialer on nothing.
    return layout === 'inline' ? null : <span>{contact.phone || '—'}</span>;
  }

  // "Call patient" where there is room for it; the bare verb in a card footer
  // sharing its width with two other buttons.
  const callLabel = layout === 'field' ? 'Call patient' : 'Call';

  const buttons = (
    <>
      <Button asChild variant="outline" size="sm">
        <a href={telHref} onClick={onCall}>
          <Phone />
          {callLabel}
        </a>
      </Button>
      {/*
        Lucide carries no WhatsApp mark — brand glyphs were dropped from the
        set — and shipping a hand-rolled one would put Meta's trademark in
        our bundle. The generic message bubble beside the word "WhatsApp"
        says the same thing and is what the label is for.
      */}
      <Button asChild variant="outline" size="sm">
        <a href={waHref} target="_blank" rel="noopener noreferrer" onClick={onWhatsApp}>
          <MessageCircle />
          WhatsApp
        </a>
      </Button>
    </>
  );

  if (layout === 'inline') return buttons;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div>{contact.phone}</div>
      <div className="flex flex-wrap gap-1.5">{buttons}</div>
    </div>
  );
}
