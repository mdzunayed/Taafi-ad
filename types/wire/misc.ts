import type { AccountWire } from './auth';
import type { BookingWire } from './booking';

// ── Overview ───────────────────────────────────────────────────────────────

/** `GET /admin/stats` — a FLAT object with no `success` wrapper. */
export interface AdminStatsWire {
  active_services: number;
  pending_approvals: number;
  emergency_alerts: number;
  daily_revenue: number;
  revenue_delta: number;
  today_visits: number;
}

/** `GET /admin/chart-data` — always exactly 7 zero-filled buckets. */
export interface ChartPointWire {
  date: string;
  label: string;
  approved: number;
  declined: number;
  total: number;
}

export interface ChartDataWire {
  series: ChartPointWire[];
}

/** `GET /admin/activity` — a bare array, capped at 8 rows. */
export interface ActivityEventWire {
  id: string;
  message: string;
  timestamp: string;
  event_type: string;
  request_id?: string;
}

/** `GET /admin/live-services` — a bare array, capped at 200. */
export interface LiveServiceWire {
  id: string;
  _id?: string;
  patientName: string;
  doctorName?: string;
  providerName?: string;
  providerRole?: string;
  serviceType?: string;
  area?: string;
  status: 'on_the_way' | 'arrived' | 'in_service';
  progressPercent: number;
  elapsedMinutes: number;
  totalMinutes: number;
  latitude?: number | null;
  longitude?: number | null;
  locationUpdatedAt?: string | null;
  currentLocationText?: string;
}

// ── Patients ───────────────────────────────────────────────────────────────

export interface PatientDetailWire {
  success: boolean;
  patient: AccountWire & {
    /**
     * PHI. Rendered behind an explicit reveal, never cached to storage, and
     * never included in an error report.
     */
    medical_vault?: Record<string, unknown>;
  };
  careRequests: BookingWire[];
}

// ── Prescriptions ──────────────────────────────────────────────────────────

export interface PrescriptionAttachmentWire {
  _id?: string;
  name?: string;
  /** Absolute URL on an unguessable path — no token, no expiry. */
  url?: string;
  /** Server-sniffed from the leading bytes, never the file extension. */
  mime?: string;
  size_bytes?: number;
  uploaded_at?: string;
}

export interface PrescriptionItemWire {
  _id?: string;
  form?: string;
  drug_name?: string;
  dosage?: string;
  frequency?: { morning?: boolean; afternoon?: boolean; night?: boolean };
  meal_context?: 'before' | 'after' | 'either';
  duration_days?: number;
  notes?: string;
}

/**
 * `GET /admin/prescriptions/review-queue`.
 *
 * The queue serializes the Mongo document (snake_case) and then runs it through
 * `presentPrescription`, which appends the camelCase gate block. Both
 * conventions really are on the wire — this is not a mistake to tidy up.
 *
 * The two status fields are independent axes, not a progression:
 *   `admin_approval_status` — the clinical decision (this queue's job).
 *   `payment_status`        — whether the patient settled the visit balance.
 * `releaseStatus` is the server's collapse of both into what the PATIENT sees,
 * which is why an APPROVED script can still read PAYMENT_REQUIRED.
 */
export interface PrescriptionWire {
  id: string;
  appointmentId?: string;
  patientAccountId?: string;
  admin_approval_status?:
    | 'PENDING'
    | 'REVISION_REQUESTED'
    | 'APPROVED'
    | 'REJECTED';
  payment_status?: 'PENDING' | 'PAID' | 'FAILED';
  releaseStatus?:
    | 'PAYMENT_REQUIRED'
    | 'PENDING_ADMIN_REVIEW'
    | 'UNLOCKED'
    | 'REJECTED';
  issued_at?: string;
  paid_at?: string;
  /** Set when an admin approved. Non-null means the doctor can no longer edit. */
  locked_at?: string | null;
  /** The admin's note when a draft was sent back. Cleared on resubmit. */
  revision_note?: string;
  diagnosis?: string;
  advice?: string;
  follow_up_date?: string | null;
  items?: PrescriptionItemWire[];
  /** Scanned/uploaded scripts. A script may be items, attachments, or both. */
  attachments?: PrescriptionAttachmentWire[];
  doctor_name?: string;
  doctor?: { id?: string; full_name?: string; specialization?: string };
  patient?: { name?: string; phone?: string };
  patient_snapshot?: { name?: string; age?: number | null; gender?: string };
  rejection_reason?: string | null;
}

// ── Settings ───────────────────────────────────────────────────────────────

export interface OperationalHoursWire {
  days?: string[];
  open?: string;
  close?: string;
}

/**
 * `GET/PUT /admin/settings`.
 *
 * `PUT` applies ONLY the keys in the server's `Settings.EDITABLE` list and
 * silently ignores everything else — a camelCased key returns 200 and changes
 * nothing. See EDITABLE_SETTINGS below and keep the two in step.
 */
/**
 * Patient Home geometry as it sits ON THE SETTINGS DOCUMENT — snake_case,
 * because that is the settings surface's casing.
 *
 * The Appearance tab does NOT write it through here. It goes to
 * `/api/home-layout` (see `HomeLayoutWire` in `lib/api/content.ts`), which is
 * gated on manage_content rather than manage_settings, because hero height is
 * content rather than platform configuration. This type exists so the settings
 * read is honest about what the document holds.
 */
export interface SettingsHomeLayoutWire {
  banner_height_fraction: number;
  care_grid_columns: number;
  care_tile_aspect: number;
}

export interface SettingsWire {
  allow_auto_assignment: boolean;
  require_verified_doctors: boolean;
  maintenance_mode: boolean;
  beta_charts: boolean;
  operational_hours?: OperationalHoursWire;
  system_notification?: string;
  home_layout?: SettingsHomeLayoutWire;
  platform_commission_percent: number;
  cash_in_hand_limit: number;
  booking_deposit_amount: number;
}

export const EDITABLE_SETTINGS = [
  'allow_auto_assignment',
  'require_verified_doctors',
  'maintenance_mode',
  'beta_charts',
  'operational_hours',
  'system_notification',
  'home_layout',
  'platform_commission_percent',
  'cash_in_hand_limit',
  'booking_deposit_amount',
] as const;

/** Mongoose-enforced bounds. Mirrored in the form so 400s become field errors. */
export const SETTINGS_BOUNDS = {
  platform_commission_percent: { min: 0, max: 100 },
  booking_deposit_amount: { min: 1, max: 100_000 },
  cash_in_hand_limit: { min: 0 },
} as const;


// ── Audit ──────────────────────────────────────────────────────────────────

export interface AuditLogWire {
  id: string;
  actor_account_id: string;
  /** Snapshotted at write time — a later demotion does not rewrite history. */
  actor_role: string;
  actor_name: string;
  action: string;
  target_type: string;
  target_id: string;
  target_label: string;
  /** Only the keys that CHANGED. Free-form — do not invent a schema. */
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ip: string;
  user_agent: string;
  status: 'success' | 'failure';
  created_at: string;
}
