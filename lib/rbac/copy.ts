import { PERMISSIONS, type Permission } from './permissions';

/**
 * Denial copy, keyed by permission.
 *
 * Specific beats generic: "You don't have permission to view audit logs" tells
 * someone what happened; "Access denied" starts a support ticket. Every
 * variant is paired with {@link DENIAL_FOOTER} and the user's current role
 * badge, because "why can't I see this?" is the number one question about any
 * internal tool.
 */
export const DENIAL_COPY: Record<Permission, string> = {
  [PERMISSIONS.VIEW_AUDIT_LOG]: "You don't have permission to view audit logs.",
  [PERMISSIONS.FINANCE_WRITE]:
    "You don't have permission to move money. Ask an admin to approve this payout.",
  [PERMISSIONS.FINANCE_READ]:
    "You don't have permission to view financial records.",
  [PERMISSIONS.MANAGE_SETTINGS]:
    'You can view platform settings, but only an admin can change them.',
  [PERMISSIONS.MANAGE_PROVIDERS]:
    "You don't have permission to add or edit providers.",
  [PERMISSIONS.APPROVE_PROVIDERS]:
    "You don't have permission to verify providers or review their documents.",
  [PERMISSIONS.MANAGE_ADMINS]:
    "You don't have permission to manage staff accounts.",
  [PERMISSIONS.MANAGE_CONTENT]:
    "You don't have permission to edit what patients see in the app.",
  [PERMISSIONS.MANAGE_BOOKINGS]:
    "You don't have permission to manage bookings.",
  [PERMISSIONS.VIEW_PATIENTS]:
    "You don't have permission to view patient records.",
  [PERMISSIONS.MANAGE_ACCOUNTS]:
    "You don't have permission to change someone's role, status or contact details.",
};

export const DENIAL_FOOTER =
  'If you think this is a mistake, contact a super admin.';

export function denialCopyFor(
  permission: Permission | undefined,
  required: string[] = [],
): string {
  if (permission && DENIAL_COPY[permission]) return DENIAL_COPY[permission];
  // Fall back to whatever the server said it wanted — this is the path taken
  // when the TS mirror has drifted from the backend and the API answered 403.
  const first = required[0] as Permission | undefined;
  if (first && DENIAL_COPY[first]) return DENIAL_COPY[first];
  return "You don't have permission to view this.";
}
