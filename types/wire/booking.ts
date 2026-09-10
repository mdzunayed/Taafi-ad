/**
 * `care_requests` documents as the admin routes serialise them.
 *
 * Field names are the server's, verbatim — snake_case throughout this domain.
 * (Finance and the CMS are camelCase. Yes, in the same API. See
 * lib/api/http.ts for why there is no global converter.)
 */

/**
 * A patient-uploaded document, carried with a 30-minute presigned grant.
 *
 * FIELD NAMES ARE `describeAttachment`'s, VERBATIM
 * (backend/src/utils/bookingAttachments.js). They were previously declared here
 * as `{ name, url, mime }` — the shape of the RAW `documents` subdocument the
 * server stores, not the shape it serves. `withAttachments` deletes that raw
 * array on the way out and replaces it with these presigned descriptors, so
 * every field the console read came back `undefined` and the documents card
 * rendered "No file attached" over bookings that had files attached.
 *
 * The two are easy to confuse because both exist in the codebase; the rule is
 * that nothing outside the server ever sees the raw one.
 */
export interface BookingAttachmentWire {
  /** `<bookingId>-<index>`. Position IS the identity — subdocuments are
   *  stored with `_id: false` and the grant resolves against that position. */
  id: string;
  file_name: string;
  /** Sniffed from the leading bytes by the SERVER, never the upload's
   *  declared content type. `application/octet-stream` when unrecognised. */
  file_type: string;
  /** Presigned `/api/documents/:token` URL. EXPIRES IN 30 MINUTES. */
  file_url: string;
  /** The same grant with `?download=1` — sends Content-Disposition. */
  download_url: string;
  size_bytes?: number;
  uploaded_at?: string | null;
}

export interface AssignedProviderWire {
  id?: string;
  full_name?: string;
  phone?: string;
  role?: string;
  specialization?: string;
  profile_picture?: string;
  rating?: number;
}

/**
 * One line on an itemized invoice.
 *
 * `title` and `unit_price` are SNAPSHOTS taken when the line was added, not
 * live reads of the catalog: re-pricing a supply never re-prices a bill that
 * already quoted it. `item_id` is a back-pointer for traceability and is null
 * on a custom charge — nothing populates it.
 */
export interface BookingLineItemWire {
  item_type: 'service' | 'supply' | 'custom';
  item_id?: string | null;
  title: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  /** Snapshotted from the supply ("pack", "strip"). Null on other line types. */
  unit?: string | null;
  /**
   * Present and true only on the fallback line the server synthesises for a
   * booking that was never itemized. It is not a stored row, so a console must
   * not offer to edit it as though it were one.
   */
  synthesized?: boolean;
}

/**
 * THE finalized receipt for a closed booking, frozen when it closed.
 *
 * Serialized as `invoice` on every booking payload and NULL on every one that
 * is still in flight — an unfinished visit has no receipt, and the live
 * `final_price` / `line_items` fields above are what its Money card renders.
 *
 * ## Read it; do not recompute it
 *
 * Two of these figures cannot be recovered from the booking's own fields once
 * it has settled, which is why the object exists at all
 * (`backend/src/utils/invoiceArchive.js`):
 *
 *   `balance_paid`    — what was actually settled after the deposit.
 *                       `remaining_balance` collapses to 0 the moment a
 *                       booking settles, so this console, the patient app and
 *                       the PDF renderer were each subtracting it out for
 *                       themselves.
 *   `payment_method`  — the RAIL the money arrived on. The booking's own
 *                       `payment_channel` is overwritten server-side with the
 *                       normalized ONLINE|CASH posture, so a receipt built
 *                       from it would badge cash counted at a patient's door
 *                       as "Online".
 */
export interface BookingInvoiceWire {
  /**
   * `FINAL_INVOICE` for a delivered visit. `DEPOSIT_RECEIPT` for one cancelled
   * after money had been taken — its lines describe what was QUOTED, not what
   * was performed, and nothing beyond the deposit is owed.
   */
  kind: 'FINAL_INVOICE' | 'DEPOSIT_RECEIPT';
  status: string;
  currency: string;
  /**
   * When the receipt was frozen. Null on one the server derived live for a row
   * that closed before archiving shipped — honest that this copy was computed
   * on read rather than stamped at close.
   */
  finalized_at?: string | null;

  /** The full ledger in authored order, plus the same rows split by kind. */
  line_items: BookingLineItemWire[];
  services: BookingLineItemWire[];
  supplies: BookingLineItemWire[];
  other_charges: BookingLineItemWire[];
  /** Whether an operator actually itemized this, vs one synthesised row. */
  is_itemized: boolean;

  subtotal: number;
  discount_percentage: number;
  discount_amount: number;
  /** What the visit COST: subtotal less the discount. */
  total_payable: number;

  deposit_paid: number;
  deposit_paid_at?: string | null;
  deposit_transaction_id?: string | null;
  balance_paid: number;
  balance_paid_at?: string | null;
  balance_transaction_id?: string | null;
  /** What the patient HANDED OVER. Equals `total_payable` once settled. */
  total_paid: number;
  amount_outstanding: number;
  is_settled: boolean;

  /** `BKASH | NAGAD | ROCKET | UPAY | CARD | BANK_TRANSFER | CASH | ONLINE`. */
  payment_method?: string | null;
  payment_method_label?: string | null;
  deposit_method?: string | null;
  deposit_method_label?: string | null;
  balance_method?: string | null;
  balance_method_label?: string | null;
  collected_by_provider_id?: string | null;
  collected_at?: string | null;

  /** PATIENT-VISIBLE operations note, carried onto the receipt. */
  call_summary_notes?: string | null;
  service_title?: string | null;
  promo_code?: string | null;
}

export interface BookingWire {
  id: string;
  patient_name: string;
  patient_account_id?: string;
  patient_phone?: string;
  care_type: string;
  service_id?: string | null;
  provider_type?: 'DOCTOR' | 'NURSE' | null;

  status: string;
  milestone?: string;
  urgency_level?: string;

  location_text?: string;
  area?: string;
  latitude?: number | null;
  longitude?: number | null;

  preferred_time?: string | null;
  scheduled_time?: string | null;
  duration_hours?: number;
  condition_note?: string;

  // ── Money ──────────────────────────────────────────────────────────────
  offered_budget?: number;
  final_price?: number | null;
  /**
   * The lines `final_price` is made of.
   *
   * NEVER ABSENT on a serialised booking, and never trusted as the total. The
   * server projects a single synthesised line for a booking priced through the
   * flat `set-deposit` path, flagged `synthesized`, so a reader always has a
   * ledger to render — see `projectLineItems` in
   * `backend/src/models/CareRequest.js`. `is_itemized` is the honest answer to
   * "did an operator actually itemize this?".
   */
  line_items?: BookingLineItemWire[];
  is_itemized?: boolean;
  /** Σ line totals, BEFORE the discount. Null when nothing has been priced. */
  subtotal?: number | null;
  /**
   * The discount as authored (0–100). `adjusted_discount` holds the same
   * decision in currency and is what every balance calculation reads; this
   * exists because the percentage cannot be recovered from the amount once the
   * subtotal moves, and the patient app renders a literal "(30%)" label.
   */
  discount_percentage?: number | null;
  /** Server-side echo of `adjusted_discount`, under the spec's name. */
  discount_amount?: number | null;
  /** Server-side echo of `final_price`, under the spec's name. */
  final_total?: number | null;
  advance_deposit_required?: number | null;
  /**
   * THE doctor-assignment gate. Derived server-side from the settlement stamps
   * rather than stored, so it cannot disagree with the money — see the note in
   * `backend/src/models/CareRequest.js`. The console greys the dispatch
   * controls on this; the server enforces the same rule independently.
   */
  is_payment_confirmed?: boolean;
  payment_confirmed_at?: string | null;
  payment_confirmed_by?: string | null;
  required_deposit?: number | null;
  deposit_quoted_amount?: number | null;
  deposit_amount?: number | null;
  adjusted_discount?: number | null;
  deposit_paid_at?: string | null;
  final_paid_at?: string | null;
  payment_preference?: string | null;
  payment_channel?: string | null;
  remaining_payment_status?: string | null;
  /**
   * The DEPOSIT's posture, derived server-side and shipped on every projection
   * (backend/src/utils/depositPosture.js):
   * `NOT_REQUIRED | PENDING | FAILED | PENDING_VERIFICATION | CONFIRMED`.
   *
   * PENDING_VERIFICATION is the state this console's "Confirm deposit received"
   * button exists to clear: the patient has said they paid and nobody has
   * matched it against the receiving statement. Money is NOT in.
   */
  deposit_status?: string | null;
  deposit_manual_status?: string | null;
  deposit_manual_rail?: string | null;
  deposit_manual_reference?: string | null;
  deposit_manual_submitted_at?: string | null;

  // ── Notes ──────────────────────────────────────────────────────────────
  /** Internal triage note. NOT shown to the patient. */
  admin_note?: string | null;
  /** PATIENT-VISIBLE — renders as "Note from Operations" in the app. */
  call_summary_notes?: string | null;

  // ── Assignment ─────────────────────────────────────────────────────────
  assigned_doctor_id?: string | null;
  assigned_doctor_name?: string | null;
  assigned_nurse_id?: string | null;
  assigned_nurse_name?: string | null;
  assigned_helper_id?: string | null;
  assigned_helper_name?: string | null;
  assigned_provider?: AssignedProviderWire | null;
  assignment_type?: string | null;
  acceptance_status?: string | null;

  /**
   * Parseable cancellation provenance — `ADMIN | PATIENT | SYSTEM`, or null on
   * a booking that was never cancelled. Distinct from the human sentence the
   * same event writes into `admin_note`; the archive reads this one so it can
   * say who called the visit off without parsing prose.
   */
  cancelled_by?: 'ADMIN' | 'PATIENT' | 'SYSTEM' | null;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  completed_at?: string | null;
  prescription_unlocked?: boolean;

  /**
   * The frozen receipt, or null while the booking is still in flight. See
   * `BookingInvoiceWire` — its presence, not the status, is what tells this
   * console whether there is a receipt to print.
   */
  invoice?: BookingInvoiceWire | null;
  /** When the receipt was frozen. Null on an in-flight or never-archived row. */
  invoice_finalized_at?: string | null;

  /**
   * Presigned descriptors for the medical records the patient attached at
   * booking time, minted per read. The ONLY way the console sees them: the raw
   * `documents` array carries permanent Cloudinary URLs and `withAttachments`
   * deletes it before the payload leaves the API, deliberately, so a link that
   * never expires cannot end up in devtools or a browser history.
   *
   * Absent on payloads that are a bare `toJSON()` — a mutation response, say —
   * rather than a decorated booking read. Merge such a response into the cached
   * row instead of replacing it, or the documents card blanks.
   */
  attachments?: BookingAttachmentWire[];

  created_at?: string;
  updated_at?: string;
}

/** A row from `/admin/requests/:id/{doctors,nurses,helpers}`. */
export interface DispatchCandidateWire {
  id: string;
  full_name: string;
  phone?: string;
  role: 'doctor' | 'nurse' | 'helper';
  specialization?: string;
  specialty?: string;
  fee?: number;
  rating?: number;
  years_experience?: number;
  profile_picture?: string;
  verification_status?: string;
  /** Live haversine distance, present only when both sides have GPS. */
  distance_km?: number | null;
  active_job_count?: number;
  dispatch_status?: 'AVAILABLE' | 'ON_SERVICE' | 'OFFLINE';
  duty_status?: 'ONLINE' | 'ON_SERVICE' | 'OFFLINE';
  on_service_until?: string | null;
}

export interface TeamPoolWire {
  success: boolean;
  doctors: DispatchCandidateWire[];
  nurses: DispatchCandidateWire[];
}

/**
 * Statuses from which a booking can be dispatched, mirroring `ASSIGNABLE`
 * in backend/src/routes/admin.js.
 */
export const ASSIGNABLE_STATUSES = [
  'deposit_paid_admin_reviewing',
  'approved',
  'assigned',
  'amount_assigned_awaiting_final_payment',
] as const;

export const TERMINAL_STATUSES = ['completed', 'cancelled', 'rejected'] as const;

/** `POST /requests/bulk-status` accepts ONLY these two. */
export const BULK_STATUSES = ['rejected', 'cancelled'] as const;

/**
 * The patient-facing milestone vocabulary, mirroring `MILESTONES` +
 * `CANCELLED` in backend/src/utils/bookingMilestones.js.
 *
 * These are NOT the canonical `status` values. The lifecycle enum is rich —
 * two-phase deposit states, provider acceptance, nurse hand-off, balance
 * settlement — because payments, dispatch and chat gating all reason off it.
 * The patient sees six steps. `PATCH /admin/bookings/:id/status` takes either
 * vocabulary and maps between them, and the console sends MILESTONES: an
 * operator forcing a booking forward is thinking in the tracker the patient is
 * looking at, not in `amount_assigned_awaiting_final_payment`.
 *
 * `canonical` is what the server will actually write, shown in the UI so the
 * operator can see the state they are really landing on.
 */
export const MILESTONES = [
  {
    key: 'REQUESTED',
    step: 1,
    label: 'Booking received',
    canonical: 'submitted',
    help: 'Back to triage. The patient sees an unconfirmed request.',
  },
  {
    key: 'CONFIRMED',
    step: 2,
    label: 'Confirmed — assigning',
    canonical: 'approved',
    help: 'Accepted, no provider picked yet.',
  },
  {
    key: 'SCHEDULED',
    step: 3,
    label: 'Provider assigned',
    canonical: 'assigned',
    help: 'Normally reached by dispatching a team, not by forcing it here.',
  },
  {
    key: 'EN_ROUTE',
    step: 4,
    label: 'On the way',
    canonical: 'enroute',
    help: 'The provider is travelling. Opens the patient↔provider channel.',
  },
  {
    key: 'IN_SERVICE',
    step: 5,
    label: 'Care in progress',
    canonical: 'in_service',
    help: 'The visit is happening.',
  },
  {
    key: 'COMPLETED',
    step: 6,
    label: 'Service complete',
    canonical: 'completed',
    help: 'TERMINAL. Closes the visit and locks the chat — nothing reopens it.',
  },
  {
    key: 'CANCELLED',
    step: 0,
    label: 'Cancelled',
    canonical: 'cancelled',
    help: 'TERMINAL. Prefer the Cancel button, which records a reason and releases the provider.',
  },
] as const;

export type MilestoneKey = (typeof MILESTONES)[number]['key'];

/** Milestones the server refuses to move OFF, because the booking is closed. */
export const TERMINAL_MILESTONES: readonly MilestoneKey[] = [
  'COMPLETED',
  'CANCELLED',
];
