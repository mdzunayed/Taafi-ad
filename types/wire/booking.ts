/**
 * `care_requests` documents as the admin routes serialise them.
 *
 * Field names are the server's, verbatim — snake_case throughout this domain.
 * (Finance and the CMS are camelCase. Yes, in the same API. See
 * lib/api/http.ts for why there is no global converter.)
 */

/** A patient-uploaded document, carried with a 30-minute presigned grant. */
export interface BookingAttachmentWire {
  name: string;
  /** Presigned `/api/documents/:token` URL. EXPIRES IN 30 MINUTES. */
  url: string;
  mime: string;
  size?: number;
  uploaded_at?: string;
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
  required_deposit?: number | null;
  deposit_quoted_amount?: number | null;
  deposit_amount?: number | null;
  adjusted_discount?: number | null;
  deposit_paid_at?: string | null;
  final_paid_at?: string | null;
  payment_preference?: string | null;
  payment_channel?: string | null;
  remaining_payment_status?: string | null;
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

  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  completed_at?: string | null;
  prescription_unlocked?: boolean;

  documents?: BookingAttachmentWire[];
  /** Presigned copies of `documents`, minted per read. */
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
