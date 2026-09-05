/** `providers` documents. snake_case, per `Provider.toJSON()`. */

export type VerificationStatus =
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'resubmit_requested';

export const VERIFICATION_STATUSES: VerificationStatus[] = [
  'pending',
  'verified',
  'rejected',
  'resubmit_requested',
];

export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  pending: 'Pending review',
  verified: 'Verified',
  rejected: 'Rejected',
  resubmit_requested: 'Re-upload requested',
};

/**
 * Which states count as "still on our desk".
 *
 * `resubmit_requested` is open and `rejected` is not, and the difference is the
 * whole point of splitting those two outcomes: a re-upload request is a loop we
 * opened, and it stays visible until the provider closes it. A rejection is
 * finished — it belongs in the roster's history, not in a work queue that would
 * never empty.
 *
 * Declared here rather than in the queue screen because the sidebar's waiting
 * count reads it too, and a badge that counted a different set from the page it
 * links to is a badge nobody can trust.
 */
export const OPEN_VERIFICATION_STATES: VerificationStatus[] = [
  'pending',
  'resubmit_requested',
];

/** Whether this provider is waiting on an admin. Absent status reads as
 *  `pending` — a row written before the enum existed has not been decided. */
export function isAwaitingDecision(status?: VerificationStatus): boolean {
  return OPEN_VERIFICATION_STATES.includes(status ?? 'pending');
}

/** The three outcomes `POST /admin/providers/:id/verification` accepts. */
export type VerificationDecision = 'approve' | 'reject' | 'request_reupload';

export interface QualificationDocumentWire {
  /** Retained deliberately — this is the `:docId` handle for the review PATCH. */
  _id: string;
  name: string;
  /**
   * A PUBLIC absolute URL on an unguessable path
   * (`provider-docs/<providerId>/<uuid>`). No bearer needed — drop it
   * straight into an <img> or <iframe>.
   */
  url: string;
  storage_key?: string;
  /** Sniffed from the leading bytes server-side, never trusted from the client. */
  mime: 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp' | '';
  size_bytes?: number;
  /**
   * `'nid'` is the national identity card. It is a document type rather than a
   * field of its own so it lands in the same review queue, and carries the
   * same per-document approve/reject verdict, as every other credential.
   */
  doc_type: 'degree' | 'license' | 'training' | 'experience' | 'nid' | 'other';
  uploaded_at?: string;
  review_status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
  reviewed_at?: string | null;
  review_note?: string;
}

/** `Provider.present_address` — structured, unlike the patient's one-line
 *  `Account.address`. House and road are optional; area and city are what the
 *  server requires at registration, because they are the dispatch-relevant
 *  halves as well as identity ones. */
export interface PresentAddressWire {
  house?: string;
  road?: string;
  area?: string;
  city?: string;
}

export interface ProviderWire {
  id: string;
  /** Hard link to the `accounts` row this provider signs in as. Absent on
   *  rows written before the FK existed — the server still falls back to
   *  matching by email, phone, then name for those. */
  account_id?: string | null;
  full_name: string;
  email?: string;
  phone?: string;
  role: 'doctor' | 'nurse' | 'helper';
  specialization?: string;
  specialty?: string;
  bio?: string;
  hospital_affiliation?: string;
  /** Academic degrees, e.g. "MBBS, FCPS". Printed on the prescription pad
   *  header, and one of the claims the credential review checks. */
  degrees?: string;
  years_experience?: number;
  experience?: number;
  fee?: number;
  rating?: number;
  review_count?: number;
  profile_picture?: string;
  service_radius_km?: number;

  /** Doctors. Not editable through the admin OTP route — provider self-service.
   *  This is the number the reviewer checks against the uploaded certificate. */
  bmdc_license?: string;

  /** The onboarding claim captured at doctor self-registration
   *  (`POST /auth/register-doctor`). Absent on admin-provisioned providers and
   *  on every row predating that route, so the review dialog renders each of
   *  these as "Not provided" rather than assuming they are there. */
  present_address?: PresentAddressWire;
  /** The MBBS-awarding institution. Free text — BMDC's register is not
   *  machine-readable, so a reviewer checks this against the certificate by
   *  eye. Distinct from `hospital_affiliation`, which is where they work now. */
  medical_college?: string;
  /** MBBS graduation year. `null`, never `0`, when unknown. */
  graduation_year?: number | null;
  /** Nurses. Same caveat. */
  nursing_license?: string;

  /**
   * The credentialing decision. `rejected` and `resubmit_requested` are new
   * alongside the explicit decision endpoint — a client that only knows
   * `pending | verified` will render them as neither.
   *
   * `resubmit_requested` is deliberately not a flavour of `rejected`: it is a
   * request for better documents, and the provider app routes it to the upload
   * screen rather than to support.
   */
  verification_status: VerificationStatus;
  /** Why the last decision went that way. Sent to the provider verbatim. */
  verification_reason?: string;
  verification_decided_at?: string | null;
  verification_decided_by?: string | null;
  /** Derived from `verification_status` server-side — never set these directly. */
  is_verified_doctor?: boolean;
  is_verified_nurse?: boolean;
  /** Account gate, orthogonal to verification. A suspended provider keeps
   *  their credentials but is withheld from dispatch. */
  status?: 'active' | 'suspended';
  availability_status?: string;

  /**
   * Negotiated commercial terms. `null` means "use the platform default" and
   * is NOT the same as `0`, which is a real term (a partner keeping their
   * whole fee).
   */
  commission_percent?: number | null;
  flat_visit_fee?: number | null;

  /** Hosted PNG/JPEG of the provider's uploaded paper signature. Public URL. */
  signature_url?: string;
  qualification_documents?: QualificationDocumentWire[];

  created_at?: string;
  updated_at?: string;
}

/** `GET /admin/providers/:id/qualifications` */
export interface QualificationBundleWire {
  success: boolean;
  provider_id: string;
  full_name: string;
  role: string;
  signature_url: string;
  documents: QualificationDocumentWire[];
}

/**
 * `POST /admin/create-provider`.
 *
 * `temporaryPassword` is returned ONCE and never again. It must not be
 * toasted, logged, or left sitting in a query cache.
 */
export interface CreateProviderResultWire {
  success: boolean;
  message?: string;
  account: { id: string; full_name: string; email?: string; phone: string };
  providerId: string;
  temporaryPassword: string;
  requiresPasswordReset: boolean;
}

/** `POST /admin/providers/:id/request-update-otp` */
export interface ProviderOtpDispatchWire {
  success: boolean;
  message?: string;
  providerId: string;
  providerName: string;
  expiresAt: string;
  /** Present unless AUTH_STRICT=1. A dev convenience — label it as such. */
  dev_otp?: string;
}

/**
 * Fields `PATCH /admin/providers/:id/update-profile` will actually apply.
 * Anything else is silently dropped by the server, which looks exactly like
 * a save that did nothing.
 */
export const PROVIDER_EDITABLE_FIELDS = [
  'full_name',
  'phone',
  'email',
  'specialization',
  'specialty',
  'years_experience',
  'fee',
  'service_radius_km',
  'hospital_affiliation',
  'bio',
] as const;
