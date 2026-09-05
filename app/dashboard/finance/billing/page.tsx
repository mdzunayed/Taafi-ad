import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/rbac/permission-gate';
import { BillingTable } from './billing-table';

export const metadata: Metadata = { title: 'Billing' };

export default function BillingPage() {
  return (
    <>
      <PageHeader
        title="Billing"
        description="Completed visits and what was collected on each."
      />
      <PermissionGate capability="finance.read">
        <BillingTable />
      </PermissionGate>
    </>
  );
}
