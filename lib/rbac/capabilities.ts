import { PERMISSIONS, type Permission } from './permissions';

/**
 * What the UI gates each action on — deliberately NOT always what the API
 * enforces.
 *
 * The backend gates the whole admin router with `requireRole('admin')`, and
 * `expandRoles('admin')` resolves to `{admin, support_member, super_admin}`.
 * Only about eleven routes carry an additional `requirePermission`. Taken
 * literally, that means a support member may edit promo banners, approve
 * prescriptions, and set deposits — which contradicts the intent written into
 * the backend's own permission table ("They do not move money, change
 * platform settings, or mint other admins").
 *
 * We gate on the intent. Where that makes the portal stricter than the API,
 * the entry records BOTH facts, so the next person to read this doesn't
 * "fix" the divergence by loosening the UI. When the backend tightens those
 * routes, the `serverGuard` note goes away and nothing else changes.
 */
export interface Capability {
  /** The permission the UI requires. */
  uiPermission: Permission;
  /** What the server actually enforces on the underlying route(s). */
  serverGuard: string;
  /**
   * Present only when the two columns disagree — in EITHER direction.
   *
   * Usually the UI is deliberately stricter. `accounts.permissions` is the
   * one case where the server is: it demands the actual `super_admin` role,
   * which no permission slug can express.
   */
  note?: string;
}

export const CAPABILITIES = {
  // ── Bookings ────────────────────────────────────────────────────────────
  'bookings.read': {
    uiPermission: PERMISSIONS.MANAGE_BOOKINGS,
    serverGuard: 'requirePermission(MANAGE_BOOKINGS)',
  },
  'bookings.dispatch': {
    uiPermission: PERMISSIONS.MANAGE_BOOKINGS,
    serverGuard: 'requirePermission(MANAGE_BOOKINGS)',
  },
  'bookings.setPrice': {
    uiPermission: PERMISSIONS.MANAGE_BOOKINGS,
    serverGuard: 'requirePermission(MANAGE_BOOKINGS)',
  },
  /**
   * Creating a booking from a phone call. Gated on manage_bookings even
   * though the endpoint can provision a patient ACCOUNT as a side effect —
   * support_member is the role that answers the phone, and mirroring the
   * server's manage_accounts gate on /admin/patients here would hide the
   * feature from everyone it was built for.
   */
  'bookings.create': {
    uiPermission: PERMISSIONS.MANAGE_BOOKINGS,
    serverGuard: 'requirePermission(MANAGE_BOOKINGS)',
  },
  'bookings.verifyPayment': {
    uiPermission: PERMISSIONS.FINANCE_WRITE,
    serverGuard: 'requirePermission(MANAGE_BOOKINGS)',
    note: 'API gates this on manage_bookings; UI is stricter — confirming money moved is a finance action.',
  },
  /**
   * Confirming a deposit NOBODY claimed, from the booking detail page. No
   * divergence to record: the server gates this one on finance_write too, so
   * the mirror and the API agree and a support member is refused by both.
   */
  'bookings.confirmPayment': {
    uiPermission: PERMISSIONS.FINANCE_WRITE,
    serverGuard: 'requirePermission(FINANCE_WRITE)',
  },

  /**
   * Forcing a booking through the lifecycle by hand — the escape hatch for
   * when the real world and the database disagree.
   *
   * Same permission as dispatch, and deliberately so: the operator who can
   * decide WHO attends a visit is the one who has to be able to say that they
   * arrived. Holding this higher would leave the person on the phone with the
   * patient unable to correct the tracker the patient is staring at.
   *
   * What makes it safe to hand to support is not the gate but the shape of the
   * write: the server refuses to move a booking that is already terminal, so
   * the worst outcome is a visit closed early, not a closed visit reopened.
   */
  'bookings.overrideStatus': {
    uiPermission: PERMISSIONS.MANAGE_BOOKINGS,
    serverGuard: 'requirePermission(MANAGE_BOOKINGS)',
  },

  // ── Prescriptions ───────────────────────────────────────────────────────
  /**
   * Reading the review queue. Rows arrive UNREDACTED — full medication list,
   * diagnosis, and the patient's name and phone — because you cannot review a
   * script you cannot read. Support answers the phone about prescriptions, so
   * they see the queue; only the decision is held higher.
   */
  'prescriptions.read': {
    uiPermission: PERMISSIONS.MANAGE_BOOKINGS,
    serverGuard: "requireRole('admin')",
    note: 'API gates the queue on the admin role alone; the UI mirrors the intent that support may read it.',
  },
  /**
   * Approve / reject / request revision. All three are the same act — a
   * medical admin's sign-off on someone else's clinical judgement — so they
   * share one capability rather than splitting the destructive outcomes out.
   *
   * Approving LOCKS the script against further edits by the issuing doctor,
   * which is precisely why this is not a manage_bookings action: it ends the
   * doctor's ability to correct their own work.
   */
  'prescriptions.approve': {
    uiPermission: PERMISSIONS.APPROVE_PROVIDERS,
    serverGuard: 'requirePermission(MANAGE_BOOKINGS)',
    note: 'API gates this on manage_bookings; UI is stricter — signing off a prescription is a clinical act.',
  },

  /**
   * Correcting a doctor's draft in place, rather than sending it back.
   *
   * No divergence note here, and that is the point: this endpoint was written
   * after the review above, and the SERVER gates it on `approve_providers`
   * directly. Rewriting a drug dosage is at least as clinical an act as
   * signing one off, and support staff answering the phone hold
   * `manage_bookings` — so gating the amendment there would have let the call
   * centre edit medication. The two sides agree; keep them agreeing.
   */
  'prescriptions.amend': {
    uiPermission: PERMISSIONS.APPROVE_PROVIDERS,
    serverGuard: 'requirePermission(APPROVE_PROVIDERS)',
  },

  // ── Providers ───────────────────────────────────────────────────────────
  'providers.read': {
    uiPermission: PERMISSIONS.MANAGE_BOOKINGS,
    serverGuard: "requireRole('admin')",
    note: 'Roster visibility is needed for dispatch, so support can read it.',
  },
  'providers.verify': {
    uiPermission: PERMISSIONS.APPROVE_PROVIDERS,
    serverGuard: "requirePermission(APPROVE_PROVIDERS)",
  },
  'providers.reviewQualification': {
    uiPermission: PERMISSIONS.APPROVE_PROVIDERS,
    serverGuard: "requirePermission(APPROVE_PROVIDERS)",
  },
  'providers.manage': {
    uiPermission: PERMISSIONS.MANAGE_PROVIDERS,
    serverGuard: "requirePermission(MANAGE_PROVIDERS)",
  },
  'admins.manage': {
    uiPermission: PERMISSIONS.MANAGE_ADMINS,
    serverGuard: "requirePermission(MANAGE_ADMINS)",
  },

  // ── Patients ────────────────────────────────────────────────────────────
  'patients.read': {
    uiPermission: PERMISSIONS.VIEW_PATIENTS,
    serverGuard: 'requirePermission(VIEW_PATIENTS)',
  },

  // ── Account governance ──────────────────────────────────────────────────
  'accounts.manage': {
    uiPermission: PERMISSIONS.MANAGE_ACCOUNTS,
    serverGuard: 'requirePermission(MANAGE_ACCOUNTS)',
  },
  'accounts.permissions': {
    uiPermission: PERMISSIONS.MANAGE_ADMINS,
    serverGuard: 'requireSuperAdmin()',
    note:
      'Server is stricter than this slug: only an actual super_admin passes. ' +
      'An admin holds manage_admins but is refused, so the UI gates on the ' +
      'role too — see StaffTable.',
  },

  // ── Finance ─────────────────────────────────────────────────────────────
  'finance.read': {
    uiPermission: PERMISSIONS.FINANCE_READ,
    serverGuard: 'requirePermission(FINANCE_READ)',
  },
  'finance.write': {
    uiPermission: PERMISSIONS.FINANCE_WRITE,
    serverGuard: "requirePermission(FINANCE_WRITE)",
  },

  // ── System ──────────────────────────────────────────────────────────────
  'settings.read': {
    uiPermission: PERMISSIONS.MANAGE_BOOKINGS,
    serverGuard: "requireRole('admin')",
    note: 'Settings are readable by support (read-only form); only writes are gated.',
  },
  'settings.write': {
    uiPermission: PERMISSIONS.MANAGE_SETTINGS,
    serverGuard: "requirePermission(MANAGE_SETTINGS)",
  },
  'audit.read': {
    uiPermission: PERMISSIONS.VIEW_AUDIT_LOG,
    serverGuard: "requirePermission(VIEW_AUDIT_LOG)",
  },

  // ── Content CMS ─────────────────────────────────────────────────────────
  'content.read': {
    uiPermission: PERMISSIONS.MANAGE_CONTENT,
    serverGuard: 'requirePermission(MANAGE_CONTENT)',
  },
  'content.write': {
    uiPermission: PERMISSIONS.MANAGE_CONTENT,
    serverGuard: 'requirePermission(MANAGE_CONTENT)',
  },
} as const satisfies Record<string, Capability>;

export type CapabilityId = keyof typeof CAPABILITIES;

export function permissionFor(id: CapabilityId): Permission {
  return CAPABILITIES[id].uiPermission;
}
