import { api } from './http';
import { P } from './paths';
import { unwrapField, unwrapFieldArray, unwrapFlat } from './unwrap';
import type { Permission } from '@/lib/rbac/permissions';
import type {
  AccountStatus,
  AdminAccountWire,
  AssignableRole,
  CreatePatientResultWire,
  CreateStaffResultWire,
  StaffCreatableRole,
} from '@/types/wire/account';

export interface AccountQuery {
  /** `staff` is a server-side alias for admin + super_admin + support_member. */
  role?: AssignableRole | 'staff';
  status?: AccountStatus;
  q?: string;
  limit?: number;
}

/** `GET /admin/accounts` — `{success, accounts}`, capped at 500. */
export async function listAccounts(
  query: AccountQuery = {},
): Promise<AdminAccountWire[]> {
  const res = await api.get(`${P.admin}/accounts`, { params: query });
  return unwrapFieldArray<AdminAccountWire>(res, 'accounts');
}

export async function getAccount(id: string): Promise<AdminAccountWire> {
  const res = await api.get(`${P.admin}/accounts/${id}`);
  return unwrapField<AdminAccountWire>(res, 'account');
}

/**
 * Profile edit. Changing `phone` clears `phone_verified` server-side — the
 * proof was attached to the old number, so the row that comes back will show
 * the latch dropped.
 */
export async function updateAccount(
  id: string,
  body: { full_name?: string; email?: string; phone?: string; address?: string },
): Promise<AdminAccountWire> {
  const res = await api.patch(`${P.admin}/accounts/${id}`, body);
  return unwrapField<AdminAccountWire>(res, 'account');
}

/** `reason` is mandatory. The server 400s with `reason_required` without it. */
export async function setAccountRole(
  id: string,
  body: { role: AssignableRole; reason: string },
): Promise<AdminAccountWire> {
  const res = await api.patch(`${P.admin}/accounts/${id}/role`, body);
  return unwrapField<AdminAccountWire>(res, 'account');
}

/**
 * Freeze / restore. `reason` is mandatory for anything other than `active`.
 *
 * Takes effect on the target's very next request — every privileged guard
 * re-reads `status` from Mongo, so there is no session to tear down.
 */
export async function setAccountStatus(
  id: string,
  body: { status: AccountStatus; reason?: string },
): Promise<AdminAccountWire> {
  const res = await api.patch(`${P.admin}/accounts/${id}/status`, body);
  return unwrapField<AdminAccountWire>(res, 'account');
}

/** Manual override for the OTP latch that gates booking. `reason` mandatory. */
export async function verifyAccountPhone(
  id: string,
  body: { reason: string },
): Promise<AdminAccountWire> {
  const res = await api.post(`${P.admin}/accounts/${id}/verify-phone`, body);
  return unwrapField<AdminAccountWire>(res, 'account');
}

/**
 * The permission matrix write. **Super admin only** — a plain admin gets 403
 * `forbidden_role`, not `missing_permission`.
 *
 * Both arrays REPLACE what is stored; they are not merged. Always send the
 * complete intended state, or un-ticking a box silently does nothing.
 */
export async function setAccountPermissions(
  id: string,
  body: { granted: Permission[]; denied: Permission[]; reason: string },
): Promise<AdminAccountWire> {
  const res = await api.patch(`${P.admin}/accounts/${id}/permissions`, body);
  return unwrapField<AdminAccountWire>(res, 'account');
}

/**
 * `POST /admin/accounts` — provisions a back-office login.
 *
 * **Super admin only.** A plain admin gets 403 `forbidden_role`, not
 * `missing_permission`: holding `manage_accounts` lets you edit someone
 * already on the roster, but minting a new privileged login is the act that
 * widens who can reach the console at all.
 *
 * Carries `temporaryPassword` exactly once and it is never retrievable again,
 * so show it in a dialog that cannot be dismissed by accident and keep it out
 * of the query cache — same contract as `createPatient` below.
 *
 * Conflicts come back as 409 with `error_code` `phone_taken` or `email_taken`.
 */
export async function createStaffAccount(body: {
  full_name: string;
  email: string;
  phone: string;
  role: StaffCreatableRole;
}): Promise<CreateStaffResultWire> {
  const res = await api.post(`${P.admin}/accounts`, body);
  return unwrapFlat<CreateStaffResultWire>(res);
}

/**
 * `POST /admin/patients`.
 *
 * Carries `temporaryPassword` exactly once — there is no way to retrieve it
 * again. Show it in a dialog that cannot be dismissed by accident and keep it
 * out of the query cache, exactly as `createProvider` does.
 */
export async function createPatient(body: {
  full_name: string;
  phone: string;
  email?: string;
  address?: string;
}): Promise<CreatePatientResultWire> {
  const res = await api.post(`${P.admin}/patients`, body);
  return unwrapFlat<CreatePatientResultWire>(res);
}
