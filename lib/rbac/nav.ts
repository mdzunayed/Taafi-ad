import {
  Banknote,
  CalendarCheck,
  FileCheck2,
  FolderKanban,
  LayoutDashboard,
  Package,
  Settings,
  Stethoscope,
  Users,
  type LucideIcon,
} from 'lucide-react';

import type { CapabilityId } from './capabilities';

export interface NavChild {
  href: string;
  label: string;
  capability: CapabilityId;
}

/**
 * A live count the sidebar renders on a section, naming the count rather than
 * carrying a component — this module is imported by the server render and must
 * stay free of React.
 */
export type NavBadge = 'providersAwaitingDecision';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  capability: CapabilityId;
  children?: NavChild[];
  /** Rendered by `<AppSidebar>`; only ever mounts for a user who already
   *  passed `capability`, so the badge cannot fetch what its reader may not
   *  see. */
  badge?: NavBadge;
}

/**
 * The information architecture, declared once.
 *
 * `<AppSidebar>` and `<SectionTabs>` both read this, so a destination the
 * user cannot reach never appears in either place. Filtering happens during
 * the server render (the session arrives from the layout's cookie read), so
 * there is no flash of a link that then vanishes.
 */
export const NAV: NavItem[] = [
  {
    href: '/dashboard/overview',
    label: 'Overview',
    icon: LayoutDashboard,
    capability: 'bookings.read',
  },
  {
    href: '/dashboard/bookings',
    label: 'Bookings Ops',
    icon: CalendarCheck,
    capability: 'bookings.read',
    children: [
      { href: '/dashboard/bookings', label: 'All bookings', capability: 'bookings.read' },
      { href: '/dashboard/bookings/new', label: 'Manual booking', capability: 'bookings.create' },
      { href: '/dashboard/bookings/verification', label: 'Payment queue', capability: 'bookings.read' },
      // Closed bookings and their frozen receipts. Filed here rather than
      // under Finance: it is read per BOOKING — an operator arrives from a
      // patient's phone call about one visit — while Finance reasons in
      // periods and payouts.
      { href: '/dashboard/bookings/history', label: 'Invoice archive', capability: 'bookings.read' },
    ],
  },
  {
    // Filed under Bookings Ops rather than App Content, even though it is
    // catalog curation: the only surface that reads it is the invoice editor,
    // and an operator hunting for "the thing I bill medicines from" looks
    // where they bill, not where they publish. The write controls inside are
    // still gated on `content.write`.
    href: '/dashboard/supplies',
    label: 'Supplies',
    icon: Package,
    capability: 'bookings.read',
  },
  {
    href: '/dashboard/rx-approvals',
    label: 'Rx Approvals',
    icon: FileCheck2,
    capability: 'prescriptions.read',
    children: [
      { href: '/dashboard/rx-approvals', label: 'Review queue', capability: 'prescriptions.read' },
      { href: '/dashboard/rx-approvals/decided', label: 'Decided', capability: 'prescriptions.read' },
    ],
  },
  {
    href: '/dashboard/providers',
    label: 'Providers',
    icon: Stethoscope,
    capability: 'providers.read',
    // On the section, not on the "Verification queue" child: the sub-menu only
    // renders while the section is already open, so a badge down there would be
    // invisible to exactly the admin who has not thought to look.
    badge: 'providersAwaitingDecision',
    children: [
      { href: '/dashboard/providers', label: 'All providers', capability: 'providers.read' },
      {
        href: '/dashboard/doctors/verification',
        label: 'Verification queue',
        capability: 'providers.read',
      },
    ],
  },
  {
    href: '/dashboard/patients',
    label: 'Patients',
    icon: Users,
    capability: 'patients.read',
  },
  {
    href: '/dashboard/finance',
    label: 'Billing & Finance',
    icon: Banknote,
    capability: 'finance.read',
    children: [
      { href: '/dashboard/finance/billing', label: 'Billing', capability: 'finance.read' },
      { href: '/dashboard/finance/cash-clearance', label: 'Cash clearance', capability: 'finance.read' },
      { href: '/dashboard/finance/payouts', label: 'Payouts', capability: 'finance.read' },
    ],
  },
  {
    href: '/dashboard/content',
    label: 'App Content',
    icon: FolderKanban,
    capability: 'content.read',
    children: [
      { href: '/dashboard/content/services', label: 'Services', capability: 'content.read' },
      { href: '/dashboard/content/categories', label: 'Categories', capability: 'content.read' },
      { href: '/dashboard/content/home-sections', label: 'Home sections', capability: 'content.read' },
      { href: '/dashboard/content/banners', label: 'Banners', capability: 'content.read' },
      { href: '/dashboard/content/announcements', label: 'Announcements', capability: 'content.read' },
      { href: '/dashboard/content/appearance', label: 'Appearance', capability: 'content.read' },
    ],
  },
  {
    href: '/dashboard/system',
    label: 'System & Audit',
    icon: Settings,
    capability: 'settings.read',
    children: [
      { href: '/dashboard/system/settings', label: 'Settings', capability: 'settings.read' },
      { href: '/dashboard/system/staff', label: 'Staff & permissions', capability: 'accounts.manage' },
      { href: '/dashboard/system/audit-log', label: 'Audit log', capability: 'audit.read' },
    ],
  },
];
