import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/rbac/permission-gate';
import { StaffTable } from './staff-table';

export const metadata: Metadata = { title: 'Staff & permissions' };

/**
 * Renders role and capability assignments for back-office accounts.
 *
 * `force-dynamic` for the same reason the patient detail route uses it: this
 * page shows who holds which privileges, which is not something to leave in a
 * prerender or a CDN cache.
 */
export const dynamic = 'force-dynamic';

export default function StaffPage() {
  return (
    <>
      <PageHeader
        title="Staff & permissions"
        description="Back-office accounts, their roles, and the capabilities each one holds."
      />
      <PermissionGate capability="accounts.manage">
        <StaffTable />
      </PermissionGate>
    </>
  );
}
