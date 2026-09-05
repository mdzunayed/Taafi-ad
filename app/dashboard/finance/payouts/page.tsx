import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/rbac/permission-gate';
import { PayoutsTable } from './payouts-table';

export const metadata: Metadata = { title: 'Payouts' };

/** Bank details on this page are sensitive — keep it out of every cache. */
export const dynamic = 'force-dynamic';

export default function PayoutsPage() {
  return (
    <>
      <PageHeader
        title="Payouts"
        description="Provider withdrawal requests. Approving one means money has actually left the account."
      />
      <PermissionGate capability="finance.read">
        <PayoutsTable />
      </PermissionGate>
    </>
  );
}
