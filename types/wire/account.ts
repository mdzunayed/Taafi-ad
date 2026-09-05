import type { AccountRole, Permission } from '@/lib/rbac/permissions';
import type { AccountWire } from './auth';

/**
 * `GET /admin/accounts` — snake_case, like every other model payload.
 *
 * Widens the auth `AccountWire` rather than redeclaring it: same Mongo
 * document, but this endpoint is the only one that computes and returns the
 * permission arrays, so they live here and not on the shared shape.
 *
 * The three permission arrays are distinct and the UI must not conflate them:
 *
 *   role_baseline_permissions  what the ROLE carries
 *   permissions                explicit grants stamped on this row
 *   permissions_denied         explicit revocations stamped on this row
 *   effective_permissions      the computed result the server will enforce
 *
 * `effective_permissions` is computed server-side and is the only one that
 * describes reality. The baseline is sent alongside it so the matrix can draw
 * the difference between "denied" and "never had it" — two states that look
 * identical if you only have the effective set.
 */
export interface AdminAccountWire extends Omit<AccountWire, 'role' | 'status' | 'permissions'> {
  role: AccountRole;
  status: AccountStatus;
  status_reason: string;
  status_changed_at: string | null;
  status_changed_by: string | null;
  phone_verified: boolean;
  isPhoneVerified: boolean;

  permissions: Permission[];
  permissions_denied: Permission[];
  effective_permissions: Permission[];
  role_baseline_permissions: Permission[];
}

/**
 * `inactive` is the legacy soft-delete; `suspended` is an operator action with
 * a recorded reason. Both are refused by every privileged guard and by
 * `/auth/login` — only exactly `active` gets in.
 */
export type AccountStatus = 'active' | 'inactive' | 'suspended';

export const ACCOUNT_STATUSES: AccountStatus[] = ['active', 'inactive', 'suspended'];

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  suspended: 'Suspended',
};

/**
 * Roles an admin may assign. `super_admin` is deliberately absent — promoting
 * someone into the role that edits the permission matrix is not a routine
 * support action and the API refuses it.
 */
export const ASSIGNABLE_ROLES = [
  'user',
  'doctor',
  'nurse',
  'support_member',
  'admin',
] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/** What ops staff call each role, which is not always what the DB stores. */
export const ROLE_OPTION_LABEL: Record<AssignableRole, string> = {
  user: 'Patient',
  doctor: 'Doctor',
  nurse: 'Nurse',
  support_member: 'Support member',
  admin: 'Admin',
};

/** `POST /admin/patients` — the one-shot password is never retrievable again. */
export interface CreatePatientResultWire {
  success: boolean;
  message?: string;
  account: AdminAccountWire;
  temporaryPassword: string;
  requiresPasswordReset: boolean;
}
