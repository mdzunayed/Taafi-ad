import { api } from './http';
import { P } from './paths';
import { unwrapField, unwrapFieldArray, unwrapPaged, type Paged } from './unwrap';
import type { AuditLogWire, SettingsWire } from '@/types/wire/misc';
import type {
  PrescriptionItemWire,
  PrescriptionWire,
} from '@/types/wire/misc';

// ── Settings ───────────────────────────────────────────────────────────────

export async function getSettings(): Promise<SettingsWire> {
  const res = await api.get(`${P.admin}/settings`);
  return unwrapField<SettingsWire>(res, 'settings');
}

/**
 * `PUT /admin/settings`.
 *
 * Applies ONLY keys in the server's `EDITABLE` list and silently drops the
 * rest — a mis-cased key returns 200 having changed nothing, which is the
 * worst possible failure mode for a money setting. Send snake_case.
 */
export async function updateSettings(
  patch: Partial<SettingsWire>,
): Promise<SettingsWire> {
  const res = await api.put(`${P.admin}/settings`, patch);
  return unwrapField<SettingsWire>(res, 'settings');
}

// ── Audit log ──────────────────────────────────────────────────────────────

export interface AuditQuery {
  action?: string;
  actor?: string;
  target_type?: string;
  target_id?: string;
  status?: 'success' | 'failure';
  from?: string;
  to?: string;
  page?: number;
  /** Server clamps to 200. */
  limit?: number;
}

/** The only paginated endpoint in the whole admin API. */
export async function listAuditLogs(
  query: AuditQuery,
): Promise<Paged<AuditLogWire>> {
  const res = await api.get(`${P.admin}/audit-logs`, { params: query });
  return unwrapPaged<AuditLogWire>(res);
}

/** Distinct action verbs, memoised 60s server-side. Powers the filter dropdown. */
export async function listAuditActions(): Promise<string[]> {
  const res = await api.get(`${P.admin}/audit-logs/actions`);
  return unwrapFieldArray<string>(res, 'actions');
}

// ── Prescriptions ──────────────────────────────────────────────────────────

/** Decided sets the queue can page through. Omit for the live queue. */
export type RxQueueFilter = 'approved' | 'rejected' | 'revision_requested';

/**
 * The live queue is every draft awaiting a clinical decision — PENDING plus
 * REVISION_REQUESTED, oldest-issued first.
 *
 * It is NOT gated on payment any more. A doctor's draft reaches this queue the
 * moment they submit it, so an error can be caught while the visit is fresh
 * rather than whenever the patient gets round to settling their balance. What
 * payment still gates is whether the PATIENT can open the approved script.
 */
export async function listPrescriptionQueue(
  status?: RxQueueFilter,
): Promise<PrescriptionWire[]> {
  const res = await api.get(`${P.admin}/prescriptions/review-queue`, {
    params: status ? { status } : undefined,
  });
  return unwrapFieldArray<PrescriptionWire>(res, 'prescriptions');
}

export type RxDecision = 'approve' | 'reject' | 'request_revision';

/**
 * `PATCH /admin/prescriptions/:id/approval`.
 *
 * `reason` is REQUIRED by the server for everything but `approve` — it is the
 * only thing telling the doctor what to change, and for a rejection it is the
 * recorded justification. Approving stamps `locked_at`, after which the doctor
 * can no longer edit the script.
 */
export async function decidePrescription(
  id: string,
  body: { action: RxDecision; reason?: string },
): Promise<PrescriptionWire> {
  const res = await api.patch(`${P.admin}/prescriptions/${id}/approval`, body);
  return unwrapField<PrescriptionWire>(res, 'prescription');
}

/**
 * `PATCH /admin/prescriptions/:id` — amend a draft in place.
 *
 * The correction that is not worth a round trip. A send-back
 * (`decidePrescription` with `request_revision`) is the right tool when the
 * doctor has to re-think something; this one is for "500mg is not a strength
 * that drug ships in", where the fix is unambiguous and waiting a day for a
 * clinician who has finished the visit costs the patient their medication.
 *
 * Three things it deliberately does NOT do, all enforced server-side:
 *
 * - **It cannot touch an approved script.** `locked_at` means those exact
 *   words were signed off, so the server answers **409 `prescription_locked`**
 *   — the same refusal the doctor's own pad gets. Amend before signing off.
 *   A rejected script answers 409 `prescription_rejected`.
 * - **It does not decide.** `admin_approval_status` is left exactly as it was,
 *   so an amended draft still has to be approved afterwards. A sent-back draft
 *   also stays sent back: the doctor was asked a question and editing around
 *   it does not answer it for them.
 * - **It does not tell the patient.** A draft under review is not theirs to
 *   see; the issuing doctor is notified instead, since the script carries
 *   their signature.
 *
 * Every field is optional but at least one is required — an empty body is a
 * 400, not a no-op. Sending `items` REPLACES the whole list, so send the rows
 * you want to keep alongside the ones you changed. A row-level validation
 * failure comes back as a 400 naming the index (`items[1].dosage is
 * required`), which is worth surfacing verbatim.
 */
export async function amendPrescription(
  id: string,
  body: {
    items?: PrescriptionItemWire[];
    diagnosis?: string;
    advice?: string;
    follow_up_date?: string | null;
    /** Why. Recorded on the script and sent to the doctor in the notification. */
    note?: string;
  },
): Promise<PrescriptionWire> {
  const res = await api.patch(`${P.admin}/prescriptions/${id}`, body);
  return unwrapField<PrescriptionWire>(res, 'prescription');
}
