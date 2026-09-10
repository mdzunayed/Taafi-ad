import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/rbac/permission-gate';
import { SuppliesTable } from './supplies-table';

export const metadata: Metadata = { title: 'Supplies' };

/**
 * `bookings.read`, not `content.read`.
 *
 * The gate has to match the endpoint, and `GET /admin/supplies` accepts EITHER
 * MANAGE_BOOKINGS or MANAGE_CONTENT (see `requireAnyPermission` in
 * `backend/src/middleware/auth.js`) so that support staff pricing a visit can
 * see the shelf they are billing from. `PermissionGate` takes a single
 * capability, so this picks the one the larger audience holds — support_member
 * carries MANAGE_BOOKINGS and not MANAGE_CONTENT, while every `admin` holds
 * both. The write controls inside are separately gated on `content.write`, so
 * a reader who cannot curate sees the catalog with its buttons greyed rather
 * than a page that 403s.
 */
export default function SuppliesPage() {
  return (
    <>
      <PageHeader
        title="Supplies & medicines"
        description="The shelf the invoice editor bills from. Prices here are suggestions — a line item snapshots what it was billed at, so re-pricing a row never re-prices an invoice that already quoted it."
      />
      <PermissionGate capability="bookings.read">
        <SuppliesTable />
      </PermissionGate>
    </>
  );
}
