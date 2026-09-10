/**
 * Mirror of `backend/src/utils/permissions.js`.
 *
 * SOURCE OF TRUTH IS THE BACKEND. This file is a copy kept for rendering
 * decisions only — the server re-checks every request and is the only thing
 * that actually enforces anything. When the backend matrix changes, change
 * this file in the same PR.
 *
 * The reason a mirror exists at all: `/auth/login` returns `user.permissions`,
 * the explicit-grants array, not the computed set. Without this table the
 * sidebar could not decide what to render for the SIGNED-IN user.
 *
 * It is no longer the source for anyone ELSE: `GET /admin/accounts` now
 * returns `effective_permissions` per row, computed server-side. The staff
 * roster and the permission matrix read that, never this — a matrix that
 * guessed at someone's access would be worse than no matrix.
 */

export const PERMISSIONS = {
  MANAGE_BOOKINGS: 'manage_bookings',
  APPROVE_PROVIDERS: 'approve_providers',
  MANAGE_PROVIDERS: 'manage_providers',
  VIEW_PATIENTS: 'view_patients',
  FINANCE_READ: 'finance_read',
  FINANCE_WRITE: 'finance_write',
  MANAGE_CONTENT: 'manage_content',
  MANAGE_SETTINGS: 'manage_settings',
  MANAGE_ADMINS: 'manage_admins',
  VIEW_AUDIT_LOG: 'view_audit_log',
  MANAGE_ACCOUNTS: 'manage_accounts',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];

/** The `accounts.role` values that can sign in to this portal. */
export const BACK_OFFICE_ROLES = [
  'admin',
  'super_admin',
  'support_member',
  'finance_admin',
] as const;

export type BackOfficeRole = (typeof BACK_OFFICE_ROLES)[number];
export type AccountRole = BackOfficeRole | 'doctor' | 'nurse' | 'user';

export function isBackOfficeRole(role: string | undefined | null): role is BackOfficeRole {
  return BACK_OFFICE_ROLES.includes(String(role) as BackOfficeRole);
}

/**
 * Baseline capability per role.
 *
 * Verbatim from the backend, including its comment: support handles the
 * phones — they triage bookings, look patients up, read the ledger to answer
 * "was I charged?", and onboard providers. They do not move money, change
 * platform settings, or mint other admins.
 *
 * Note `manage_providers` without `approve_providers`: support can create a
 * provider, edit them behind an OTP and suspend them, but marking a licence
 * verified and approving credentials stays with an admin.
 */
export const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  super_admin: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS,
  support_member: [
    PERMISSIONS.MANAGE_BOOKINGS,
    PERMISSIONS.VIEW_PATIENTS,
    PERMISSIONS.FINANCE_READ,
    PERMISSIONS.MANAGE_PROVIDERS,
  ],
  /**
   * Finance handles the money and nothing else: they read and write the
   * ledger and can look a patient up, because a payment line is unanswerable
   * without knowing whose it is.
   *
   * No `manage_bookings` on purpose — dispatching a visit is an ops job, and
   * whoever moves the money should not also create the booking it settles.
   */
  finance_admin: [
    PERMISSIONS.FINANCE_READ,
    PERMISSIONS.FINANCE_WRITE,
    PERMISSIONS.VIEW_PATIENTS,
  ],
  doctor: [],
  nurse: [],
  user: [],
};

/** The minimum shape this module needs from a session user. */
export interface PermissionSubject {
  role?: string | null;
  permissions?: readonly string[] | null;
  /** Explicit revocations, subtracted last. See `effectivePermissionsFor`. */
  permissions_denied?: readonly string[] | null;
}

function knownSlugs(raw: readonly string[] | null | undefined): Permission[] {
  return (raw ?? []).filter((p): p is Permission =>
    (ALL_PERMISSIONS as string[]).includes(p),
  );
}

/**
 * `(role baseline UNION grants) MINUS denials`. Verbatim from the backend.
 *
 * Union matters for the grants half: stamping one explicit grant on a support
 * member's row must widen their access, not collapse it to that permission.
 *
 * The denials half is what makes the permission matrix able to say "triage
 * bookings but do not read the ledger" without demoting the account out of its
 * role. `super_admin` short-circuits BEFORE the subtraction — same ordering as
 * the server, so a stray denial cannot lock the matrix's own editor out.
 *
 * Unknown slugs are dropped rather than thrown, matching the backend.
 */
export function effectivePermissionsFor(
  subject: PermissionSubject | null | undefined,
): Permission[] {
  if (!subject?.role) return [];
  if (subject.role === 'super_admin') return [...ALL_PERMISSIONS];

  const held = new Set<Permission>([
    ...(ROLE_PERMISSIONS[subject.role] ?? []),
    ...knownSlugs(subject.permissions),
  ]);
  for (const slug of knownSlugs(subject.permissions_denied)) held.delete(slug);
  return Array.from(held);
}

export function hasPermission(
  subject: PermissionSubject | null | undefined,
  permission: Permission,
): boolean {
  if (!subject?.role) return false;
  if (subject.role === 'super_admin') return true;
  return effectivePermissionsFor(subject).includes(permission);
}

export function hasAllPermissions(
  subject: PermissionSubject | null | undefined,
  permissions: readonly Permission[],
): boolean {
  return permissions.every((p) => hasPermission(subject, p));
}

export function hasAnyPermission(
  subject: PermissionSubject | null | undefined,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((p) => hasPermission(subject, p));
}

/**
 * Human label for a role badge.
 *
 * `support_member` reads as "Support Admin" on screen. The DB value is
 * unchanged — renaming a stored enum would need a migration to buy nothing
 * but a nicer string — so this table is the one place the two vocabularies
 * meet.
 */
export const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  support_member: 'Support Admin',
  finance_admin: 'Finance Admin',
};
