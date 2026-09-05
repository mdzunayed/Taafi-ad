import { api } from './http';
import { P } from './paths';
import { unwrapArray, unwrapField, unwrapFieldArray, unwrapFlat } from './unwrap';
import type {
  BookingWire,
  DispatchCandidateWire,
  TeamPoolWire,
} from '@/types/wire/booking';

/**
 * `GET /admin/requests` — bare array, newest first.
 *
 * UNPAGINATED AND UNLIMITED, and it mints an HMAC-signed presigned grant for
 * every attachment on every row. Do not poll this. Fetch on demand, filter
 * client-side, and give it a longer staleTime than anything else.
 */
export async function listBookings(): Promise<BookingWire[]> {
  const res = await api.get(`${P.admin}/requests`);
  return unwrapArray<BookingWire>(res, '/admin/requests');
}

/**
 * `GET /admin/bookings/:id` — a bare document, no envelope.
 *
 * Always re-read through this before opening attachments: the presigned URLs
 * on a list row expire 30 minutes after that list was fetched.
 */
export async function getBooking(id: string): Promise<BookingWire> {
  const res = await api.get(`${P.admin}/bookings/${id}`);
  return unwrapFlat<BookingWire>(res);
}

// ── Dispatch ───────────────────────────────────────────────────────────────

export async function listDispatchCandidates(
  bookingId: string,
  role: 'doctors' | 'nurses' | 'helpers',
): Promise<DispatchCandidateWire[]> {
  const res = await api.get(`${P.admin}/requests/${bookingId}/${role}`);
  return unwrapArray<DispatchCandidateWire>(res, `/admin/requests/:id/${role}`);
}

export async function getTeamPool(bookingId: string): Promise<TeamPoolWire> {
  const res = await api.get(`${P.admin}/requests/${bookingId}/team-pool`);
  return unwrapFlat<TeamPoolWire>(res);
}

/**
 * `POST /admin/requests/:id/assign`.
 *
 * The server requires AT LEAST ONE of `doctor_id` / `nurse_id` — not exactly
 * one. Sending both in a single call is the supported way to dispatch a dual
 * team, and the server derives `assignment_type` from the RESULTING
 * assignment, so adding a nurse to a booking that already has a doctor
 * correctly produces `DUAL_TEAM`. `helper_id` is an optional adjunct and
 * cannot stand alone.
 *
 * A `final_price` > 0 is mandatory, and the server refuses a provider who
 * already has an overlapping job (±2h). Those failures come back as bare
 * `{message}` 400s with no `error_code`, so the message is all the UI has —
 * show it verbatim.
 *
 * ## Always send the `*_name` alongside the `*_id`
 *
 * The handler writes `assigned_doctor_name = b.doctor_name || null`. There is
 * no server-side lookup filling that in, so omitting the name does not leave
 * the old value in place — it NULLS it. The patient-facing care card reads
 * these fields, so an assignment sent without names silently blanks the name
 * of the person turning up at the door.
 */
export async function assignTeam(
  bookingId: string,
  body: {
    doctor_id?: string;
    doctor_name?: string;
    nurse_id?: string;
    nurse_name?: string;
    helper_id?: string | null;
    helper_name?: string | null;
    final_price: number;
  },
): Promise<BookingWire> {
  const res = await api.post(`${P.admin}/requests/${bookingId}/assign`, body);
  return unwrapFlat<BookingWire>(res);
}

// ── Invoice finalisation ───────────────────────────────────────────────────

/**
 * `PATCH /admin/bookings/:id/set-deposit` — the PRE-payment path.
 *
 * Valid only while the booking is in `submitted | deposit_required |
 * awaiting_deposit`; once the deposit is paid the server answers 409 and tells
 * you to use set-price instead. Writes the immutable `deposit_quoted_amount`.
 *
 * `call_summary_notes` is three-state on the server: omit the key to leave it
 * alone, send a blank string to clear it, send text to set it.
 */
export async function setDeposit(
  bookingId: string,
  body: {
    total_service_fee: number;
    required_deposit: number;
    adjusted_discount?: number;
    admin_note?: string;
    call_summary_notes?: string;
  },
): Promise<BookingWire> {
  const res = await api.patch(`${P.admin}/bookings/${bookingId}/set-deposit`, body);
  return unwrapFlat<BookingWire>(res);
}

/** `POST /admin/requests/:id/set-price` — the POST-payment path. */
export async function setPrice(
  bookingId: string,
  body: {
    final_service_fee: number;
    adjusted_discount?: number;
    admin_note?: string;
    call_summary_notes?: string;
  },
): Promise<BookingWire> {
  const res = await api.post(`${P.admin}/requests/${bookingId}/set-price`, body);
  return unwrapFlat<BookingWire>(res);
}

// ── Manual creation ────────────────────────────────────────────────────────

export interface ManualBookingBody {
  patient_name: string;
  patient_phone: string;
  care_type: string;
  service_id?: string | null;
  /** Address parts. The server joins them into the single `location_text` line. */
  house?: string;
  road?: string;
  area?: string;
  city?: string;
  /** ISO 8601, or null for "as soon as possible". */
  preferred_time?: string | null;
  duration_hours?: number;
  /** Optional TOGETHER — sending one without the other is a 400. */
  total_service_fee?: number;
  required_deposit?: number;
  /** Patient-visible; renders as "Note from Operations" in the app. */
  call_summary_notes?: string;
  /** Internal only. */
  admin_note?: string;
  condition_note?: string;
}

export interface ManualBookingResult extends BookingWire {
  /**
   * Present ONLY when this call minted the account, i.e. the caller had never
   * used the app. Shown once, for the operator to read back before hanging up
   * — it is not retrievable afterwards.
   */
  temporaryPassword?: string;
  requiresPasswordReset?: boolean;
}

/**
 * `POST /admin/bookings/manual` — create a booking from a phone call.
 *
 * Resolves the patient by phone number and provisions an account when there
 * is none, so the booking appears in the mobile app's Active Care the moment
 * that patient signs in.
 *
 * Two failure modes worth handling at the call site rather than as a generic
 * toast: a **409** means the patient already holds an active booking (the
 * body carries `active_request_id`), and a **400** with `error_code:
 * 'deposit_exceeds_fee'` means the two money fields disagree.
 */
export async function createManualBooking(
  body: ManualBookingBody,
): Promise<ManualBookingResult> {
  const res = await api.post(`${P.admin}/bookings/manual`, body);
  return unwrapFlat<ManualBookingResult>(res);
}

// ── Verification queues ────────────────────────────────────────────────────

export async function listPendingDepositVerification(): Promise<BookingWire[]> {
  const res = await api.get(`${P.admin}/bookings/pending-deposit-verification`);
  return unwrapFieldArray<BookingWire>(res, 'bookings');
}

export async function listPendingPaymentVerification(): Promise<BookingWire[]> {
  const res = await api.get(`${P.admin}/bookings/pending-verification`);
  return unwrapFieldArray<BookingWire>(res, 'bookings');
}

export async function verifyDeposit(
  bookingId: string,
  body: { reference?: string; note?: string },
): Promise<BookingWire> {
  const res = await api.post(`${P.admin}/bookings/${bookingId}/verify-deposit`, body);
  return unwrapField<BookingWire>(res, 'booking');
}

/**
 * `POST /admin/bookings/:id/confirm-deposit` — the deposit landed but the
 * patient never filed a claim for it (they paid during the review call, or
 * transferred the money and never told the app).
 *
 * The server registers this handler under BOTH `/confirm-deposit` and the
 * older `/confirm-payment` (routes/admin.js). `confirm-deposit` is the truer
 * name — the money in question is the deposit, not the balance — so that is
 * the one posted here.
 *
 * Distinct from `verifyDeposit`, which only works on a booking sitting in the
 * verification queue and 409s otherwise. This one needs no pending claim — it
 * needs a deposit to have been SET, and it 409s when the invoice has not been
 * finalised or the booking has left a payable status.
 *
 * Gated on `finance_write` server-side, which `support_member` does not hold —
 * unlike `verifyDeposit` (`manage_bookings`). Expect a 403 for support staff.
 */
export interface ConfirmPaymentBody {
  /**
   * `DEPOSIT` (the default) settles only the advance. `FULL` also settles and
   * verifies the BALANCE and releases the visit's prescriptions — for the
   * patient who handed over the whole fee at once.
   */
  paymentType?: 'DEPOSIT' | 'FULL';
  /**
   * What the operator says they saw. A CROSS-CHECK, not an instruction: the
   * server settles the booking's own quote and answers 409 when this disagrees
   * with it, naming both figures. Send it — a mismatch caught here is a
   * mis-billing that did not happen.
   */
  amountPaid?: number;
  /** The bKash/Nagad/bank reference. `reference` is the older name for it. */
  transactionRef?: string;
  note?: string;
}

export async function confirmDepositReceived(
  bookingId: string,
  body: ConfirmPaymentBody = {},
): Promise<BookingWire> {
  const res = await api.post(
    `${P.admin}/bookings/${bookingId}/confirm-deposit`,
    body,
  );
  return unwrapField<BookingWire>(res, 'booking');
}

export async function rejectDeposit(
  bookingId: string,
  body: { reason?: string },
): Promise<BookingWire> {
  const res = await api.post(`${P.admin}/bookings/${bookingId}/reject-deposit`, body);
  return unwrapField<BookingWire>(res, 'booking');
}

export async function verifyPayment(
  bookingId: string,
  body: { reference?: string; note?: string },
): Promise<{ booking: BookingWire; prescriptionsUnlocked?: number }> {
  const res = await api.post(`${P.admin}/bookings/${bookingId}/verify-payment`, body);
  const data = res.data as {
    booking: BookingWire;
    prescriptionsUnlocked?: number;
  };
  return data;
}

// ── Status changes ─────────────────────────────────────────────────────────

export async function cancelBooking(
  bookingId: string,
  body: { reason?: string },
): Promise<BookingWire> {
  const res = await api.post(`${P.admin}/requests/${bookingId}/cancel`, body);
  return unwrapFlat<BookingWire>(res);
}

/** `POST /admin/requests/bulk-status`. The server accepts ONLY reject/cancel. */
export async function bulkUpdateStatus(
  ids: string[],
  status: 'rejected' | 'cancelled',
): Promise<{ updated: number }> {
  const res = await api.post(`${P.admin}/requests/bulk-status`, { ids, status });
  return unwrapFlat<{ updated: number }>(res);
}

/**
 * `PATCH /admin/bookings/:id/status` — the operational status override.
 *
 * The escape hatch for when the real world and the database disagree: the
 * nurse arrived and forgot to tap, the provider's app crashed mid-visit, a
 * booking is stuck in a state nobody can move it out of. It drives the same
 * patient-facing tracker the app renders, so forcing a milestone here is what
 * the patient sees change on their screen.
 *
 * ## Send a milestone, not a status
 *
 * The endpoint accepts either vocabulary, but the console sends `milestone`.
 * The canonical lifecycle enum has states the six-step tracker collapses
 * (`arrived`, `nurse_completed`, `amount_assigned_awaiting_final_payment`),
 * and an operator forcing a booking forward is thinking in the tracker, not in
 * those. See `MILESTONES` in types/wire/booking.ts for the mapping.
 *
 * ## What one call does
 *
 * Writes the canonical status, appends a `status_history` row carrying the
 * `note`, opens the patient↔provider chat channel on
 * SCHEDULED/EN_ROUTE/IN_SERVICE and locks it on COMPLETED/CANCELLED, then
 * broadcasts `booking:status_updated` and a push. The patient's card
 * re-renders without a refresh.
 *
 * ## Terminal is terminal
 *
 * The write is a compare-and-swap guarded on the booking not already being
 * `completed | cancelled | rejected`, so a closed visit answers **409** and
 * cannot be reopened — by this route or any other. Moving a booking TO
 * COMPLETED or CANCELLED is therefore one-way, which is why the UI confirms it
 * separately.
 *
 * `scheduled_time` and `assigned_provider_name` may be sent alone, without a
 * milestone, to correct a slot or a name. Sending nothing at all is a 400.
 */
export async function overrideBookingStatus(
  bookingId: string,
  body: {
    milestone?: string;
    /** ISO 8601. An explicit `null` CLEARS the committed slot. */
    scheduled_time?: string | null;
    assigned_provider_name?: string | null;
    /** Recorded on the `status_history` row. Why the override was needed. */
    note?: string;
  },
): Promise<BookingWire> {
  const res = await api.patch(`${P.admin}/bookings/${bookingId}/status`, body);
  return unwrapFlat<BookingWire>(res);
}
