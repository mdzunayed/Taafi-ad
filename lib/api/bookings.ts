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

// ── The historical invoice archive ─────────────────────────────────────────

export interface CompletedBookingsQuery {
  /** `completed` (default), `cancelled`, `rejected`, or `all`. */
  status?: string;
  /** Matches patient name, phone or care type, server-side. */
  q?: string;
  /** ISO dates, filtered on when the booking CLOSED. */
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface CompletedBookingsPage {
  bookings: BookingWire[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

/**
 * `GET /admin/bookings/completed` — closed bookings, newest first, each
 * carrying the frozen `invoice` its receipt is drawn from.
 *
 * PAGINATED AND SEARCHED SERVER-SIDE, unlike `listBookings` above. That one is
 * documented as unpaginated, unlimited, and minting a presigned attachment
 * grant per row — fine for a working queue that fits on a screen, wrong for an
 * archive that only grows and that operators actually scroll. Filtering here
 * happens in Mongo, so the browser never holds a year of bookings to filter
 * three of them out.
 */
export async function listCompletedBookings(
  query: CompletedBookingsQuery = {},
): Promise<CompletedBookingsPage> {
  const res = await api.get(`${P.admin}/bookings/completed`, {
    // Empty values are dropped rather than sent as `?q=`: the server treats a
    // blank `from` as an invalid date and a blank `q` as a match-everything
    // regex, and neither is what an operator clearing a filter meant.
    params: Object.fromEntries(
      Object.entries(query).filter(
        ([, v]) => v !== undefined && v !== null && v !== '',
      ),
    ),
  });
  const data = (res.data ?? {}) as Record<string, unknown>;
  return {
    bookings: Array.isArray(data.bookings)
      ? (data.bookings as BookingWire[])
      : [],
    page: Number(data.page) || 1,
    limit: Number(data.limit) || 25,
    total: Number(data.total) || 0,
    hasMore: data.has_more === true,
  };
}

/**
 * `GET /api/bookings/:id/receipt-pdf` — the server-rendered A4 receipt, as
 * bytes.
 *
 * NOT under `P.admin`. The endpoint lives on the shared bookings router and
 * admits staff through the same participant check the patient app passes, so
 * the console and the patient download one document rather than two
 * implementations of one. Staff access is enforced server-side; this call just
 * carries the operator's own bearer token like every other.
 *
 * Returned as a Blob rather than a link because the download needs an
 * `Authorization` header, which a bare `<a href>` cannot send. The caller mints
 * an object URL from it and revokes it after — see the archived-invoice card.
 */
export async function fetchReceiptPdf(bookingId: string): Promise<Blob> {
  const res = await api.get(`/api/bookings/${bookingId}/receipt-pdf`, {
    responseType: 'blob',
  });
  return res.data as Blob;
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
/**
 * `PATCH /admin/bookings/:id/invoice` — the itemized quote.
 *
 * SEND LINES, NEVER TOTALS. The server recomputes the subtotal, the discount
 * amount and the final total from the lines and stores its own arithmetic
 * (`backend/src/utils/invoiceLineItems.js`). The editor runs the same sums
 * locally so the operator watches the figure move as they type, but nothing it
 * computes is ever transmitted — which is what makes a console on a stale
 * bundle a display bug rather than a mis-billed patient.
 *
 * `required_deposit` is optional and may only be sent while the advance is
 * UNPAID; the server answers 409 otherwise. Omitting it leaves whatever the
 * booking was already quoted, which is what re-itemizing an in-flight booking
 * should do.
 *
 * Returns the bare updated document, same as `set-deposit`.
 */
export async function setInvoice(
  bookingId: string,
  body: {
    line_items: Array<{
      item_type: 'service' | 'supply' | 'custom';
      item_id?: string | null;
      title: string;
      quantity: number;
      unit_price: number;
    }>;
    /**
     * Percent off the subtotal, 0–100. MUTUALLY EXCLUSIVE with
     * `adjusted_discount` — the server rejects both together rather than
     * picking one, so the caller decides which kind of discount this is.
     */
    discount_percentage?: number;
    /**
     * A flat waiver in currency, for a reduction that was never a percentage.
     * The server stores it with a 0 percentage rather than back-computing one:
     * a derived "19.08%" on the patient's bill would name a decision nobody
     * made.
     */
    adjusted_discount?: number;
    required_deposit?: number;
    admin_note?: string;
    call_summary_notes?: string;
  },
): Promise<BookingWire> {
  const res = await api.patch(`${P.admin}/bookings/${bookingId}/invoice`, body);
  return unwrapFlat<BookingWire>(res);
}

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

/** One line on the invoice the operator builds during the call. */
export interface ManualLineItem {
  item_type: 'service' | 'supply' | 'custom';
  /** The catalog row, or null for a charge the operator typed in. */
  item_id?: string | null;
  title: string;
  quantity: number;
  /**
   * What the patient is billed per unit. ALWAYS sent, including when it equals
   * the catalog price: the catalog's figure is a suggestion, and re-deriving
   * it server-side would silently re-price a line the operator lowered on the
   * call.
   */
  unit_price: number;
}

export interface ManualBookingBody {
  /**
   * An existing patient, picked out of the search box. Authoritative — the
   * booking lands on this account even if a phone number typed alongside it
   * disagrees.
   */
  patientId?: string;
  /**
   * Quick-register. Resolved BY PHONE first: "new" is the operator's belief
   * and the number is the truth, so a returning caller they did not recognise
   * still lands on the account they already sign in with. `age` and `gender`
   * become the booking's care-recipient block, which is where the responding
   * clinician reads them.
   */
  newPatient?: {
    name: string;
    phone: string;
    address?: string;
    age?: number;
    gender?: string;
  };
  /**
   * Free text every list and alert renders. Optional when the invoice carries
   * a service line — the server takes the catalog's own title from it rather
   * than making the operator retype it.
   */
  care_type?: string;
  service_id?: string | null;
  /** Address parts. The server joins them into the single `location_text` line. */
  house?: string;
  road?: string;
  area?: string;
  city?: string;
  /** ISO 8601, or null for "as soon as possible". */
  preferred_time?: string | null;
  duration_hours?: number;

  /**
   * The itemized invoice. LINES ONLY — never a total.
   *
   * Every figure the form displays is recomputed server-side from these
   * (`backend/src/utils/invoiceLineItems.js`) before anything is stored, which
   * is what makes a console running a stale bundle a display bug rather than a
   * mis-billed patient.
   */
  line_items?: ManualLineItem[];
  /** Percentage form. Mutually exclusive with `adjusted_discount` — sending both is a 400. */
  discount_percentage?: number;
  /** Flat-currency waiver. Stores a 0 percentage, because there is no percentage behind it. */
  adjusted_discount?: number;
  /** What the patient pays to confirm the visit. Cannot exceed the post-discount total. */
  required_deposit?: number;
  /** The flat alternative to `line_items`. Ignored when lines are sent. */
  total_service_fee?: number;

  /**
   * The money is already in — banknotes over the counter, or a transfer the
   * operator watched land. Settles the deposit in the same write, putting the
   * booking straight into the phase the app renders as confirmed.
   *
   * `false` leaves it owed, and the patient pays from the app.
   */
  depositCollectedInCash?: boolean;
  /** Which rail a manual transfer arrived on. Left unset for physical cash. */
  deposit_rail?: 'BKASH' | 'NAGAD' | 'ROCKET' | 'UPAY' | 'BANK_TRANSFER';
  deposit_reference?: string;

  /**
   * Dispatch a doctor in the same write. Only legal alongside
   * `depositCollectedInCash` — the server refuses it otherwise with
   * `error_code: 'dispatch_requires_deposit'`, because dispatching a booking
   * whose deposit is unpaid sends a clinician to a home the patient has not
   * confirmed.
   */
  assignedDoctorId?: string;

  /** Patient-visible; renders as "Note from Operations" in the app. */
  call_summary_notes?: string;
  /** Internal only. */
  admin_note?: string;
  /** The symptoms / triage summary from the call. */
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
 * The subset of the body that carries structured data.
 *
 * Multipart has no types — every part arrives at Express as a string — so these
 * are JSON-encoded on the way out and `JSON.parse`d by the controller. Listed
 * explicitly rather than inferred from `typeof === 'object'` so a future field
 * cannot be silently stringified as `[object Object]`.
 */
const STRUCTURED_FIELDS = ['newPatient', 'line_items'] as const;

/**
 * `POST /admin/bookings/manual` — create a booking from a phone call.
 *
 * Sends `multipart/form-data` when the operator attached files and plain JSON
 * otherwise. Both land on the same handler; the multipart branch exists only
 * because a browser cannot put a file in a JSON body, and paying its encoding
 * cost on every booking that has no attachment would be pure overhead.
 *
 * Failure modes worth handling at the call site rather than as a generic toast:
 *
 * - **409** `active_booking_exists` — the patient already holds an open
 *   booking; the body carries `active_request_id` so the operator can open it.
 * - **409** `dispatch_requires_deposit` — a doctor was named on a booking whose
 *   deposit is not in.
 * - **400** `deposit_exceeds_fee` — the advance is larger than what is owed.
 * - **413 / 415** — an attachment is over 8 MB, or is not a PDF or image.
 */
export async function createManualBooking(
  body: ManualBookingBody,
  attachments: File[] = [],
): Promise<ManualBookingResult> {
  if (attachments.length === 0) {
    const res = await api.post(`${P.admin}/bookings/manual`, body);
    return unwrapFlat<ManualBookingResult>(res);
  }

  const form = new FormData();
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue;
    const structured = (STRUCTURED_FIELDS as readonly string[]).includes(key);
    form.append(key, structured ? JSON.stringify(value) : String(value));
  }
  // The field name multer is registered against. A different one is
  // LIMIT_UNEXPECTED_FILE, which surfaces as a 400 naming the field.
  for (const file of attachments) form.append('attachments', file);

  // No explicit Content-Type: the browser has to write the multipart boundary
  // into it, and setting the header by hand omits that boundary and produces a
  // body Express cannot parse at all.
  const res = await api.post(`${P.admin}/bookings/manual`, form);
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

// ── Contact attempts ───────────────────────────────────────────────────────

export type ContactChannel = 'call' | 'whatsapp';

/**
 * `POST /admin/bookings/:id/log-contact-attempt` — record that an operator
 * opened a dialer or a WhatsApp thread for this booking's patient.
 *
 * Writes ONE audit row (`booking.contact_attempted`) and touches nothing on
 * the booking itself. It is an intent, not an outcome: the browser cannot see
 * whether the call connected or the message was ever sent, so the row answers
 * "who reached out, when, on which channel" and deliberately claims no more
 * than that.
 *
 * BEST-EFFORT AT THE CALL SITE. Never await it ahead of the navigation it
 * describes and never surface its failure — losing a log line must not delay
 * or interrupt an operator ringing a patient.
 */
export async function logContactAttempt(
  bookingId: string,
  channel: ContactChannel,
): Promise<void> {
  await api.post(`${P.admin}/bookings/${bookingId}/log-contact-attempt`, { channel });
}
