import { api } from './http';
import { P } from './paths';
import { unwrapArray, unwrapField, unwrapFieldArray, unwrapFlat } from './unwrap';
import type {
  VerificationDecision,
  CreateProviderResultWire,
  ProviderOtpDispatchWire,
  ProviderWire,
  QualificationBundleWire,
  QualificationDocumentWire,
} from '@/types/wire/provider';

/** `GET /admin/providers` — bare array, capped at 500. */
export async function listProviders(): Promise<ProviderWire[]> {
  const res = await api.get(`${P.admin}/providers`);
  return unwrapArray<ProviderWire>(res, '/admin/providers');
}

/**
 * `POST /admin/providers/:id/verification` — the credentialing decision.
 *
 * Replaces the old `PATCH .../verify` toggle, which set the status to whatever
 * it currently was not: a double-click un-verified a live doctor and a retry
 * undid itself. This is explicit and idempotent.
 *
 * `reason` is required for `reject` and `request_reupload` — it is sent to the
 * provider by SMS verbatim, so it is the only thing telling them what to fix.
 *
 * `document_ids` applies to `request_reupload` only: the listed qualification
 * documents go back to `pending`. Omit it to reset all of them.
 */
export async function decideVerification(
  id: string,
  body: {
    decision: VerificationDecision;
    reason?: string;
    document_ids?: string[];
  },
): Promise<ProviderWire> {
  const res = await api.post(`${P.admin}/providers/${id}/verification`, body);
  return unwrapField<ProviderWire>(res, 'provider');
}

/**
 * `PATCH /admin/providers/:id/commission` — negotiated terms for one provider.
 *
 * Requires `finance_write`, not `manage_providers`: this sets the split on
 * every future payout. Pass `null` to clear an override and fall back to the
 * platform rate; `0` is a real value and does NOT clear it.
 *
 * Only affects visits settling from now on — the rate is snapshotted onto each
 * WalletTransaction, so past payouts are never re-priced.
 */
export async function setProviderCommission(
  id: string,
  body: { commission_percent?: number | null; flat_visit_fee?: number | null },
): Promise<ProviderWire> {
  const res = await api.patch(`${P.admin}/providers/${id}/commission`, body);
  return unwrapField<ProviderWire>(res, 'provider');
}

/** `PATCH /admin/providers/:id/status` — explicit, unlike verify. */
export async function setProviderStatus(
  id: string,
  body: { status: 'active' | 'suspended'; reason?: string },
): Promise<ProviderWire> {
  const res = await api.patch(`${P.admin}/providers/${id}/status`, body);
  return unwrapField<ProviderWire>(res, 'provider');
}

export async function getQualifications(
  id: string,
): Promise<QualificationBundleWire> {
  const res = await api.get(`${P.admin}/providers/${id}/qualifications`);
  return unwrapFlat<QualificationBundleWire>(res);
}

export async function reviewQualification(
  providerId: string,
  docId: string,
  body: { review_status: 'approved' | 'rejected'; review_note?: string },
): Promise<QualificationDocumentWire[]> {
  const res = await api.patch(
    `${P.admin}/providers/${providerId}/qualifications/${docId}`,
    body,
  );
  return unwrapFieldArray<QualificationDocumentWire>(res, 'documents');
}

/**
 * `POST /admin/create-provider`.
 *
 * The response carries `temporaryPassword` exactly once — there is no way to
 * retrieve it again. Show it in a dialog that cannot be dismissed by accident,
 * and do not let it settle into the query cache.
 */
export async function createProvider(body: {
  name: string;
  phone: string;
  role: 'doctor' | 'nurse';
  email?: string;
}): Promise<CreateProviderResultWire> {
  const res = await api.post(`${P.admin}/create-provider`, body);
  return unwrapFlat<CreateProviderResultWire>(res);
}

/** Step 1 of the two-step provider edit. OTP is valid 5 minutes. */
export async function requestUpdateOtp(
  id: string,
): Promise<ProviderOtpDispatchWire> {
  const res = await api.post(`${P.admin}/providers/${id}/request-update-otp`);
  return unwrapFlat<ProviderOtpDispatchWire>(res);
}

/**
 * Step 2. Fields outside the server's allowlist are silently dropped — which
 * looks exactly like a save that quietly did nothing. See
 * PROVIDER_EDITABLE_FIELDS.
 */
export async function updateProviderProfile(
  id: string,
  body: Record<string, unknown> & { otp: string },
): Promise<ProviderWire> {
  const res = await api.patch(`${P.admin}/providers/${id}/update-profile`, body);
  return unwrapField<ProviderWire>(res, 'provider');
}

/** `POST /admin/register-sub-admin` — requires `manage_admins`. */
export async function registerSubAdmin(body: {
  name: string;
  email: string;
  password: string;
  phone?: string;
}): Promise<{ success: boolean; message?: string }> {
  const res = await api.post(`${P.admin}/register-sub-admin`, body);
  return unwrapFlat(res);
}
