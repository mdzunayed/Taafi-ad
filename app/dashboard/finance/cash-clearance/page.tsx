import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/rbac/permission-gate';
import { CashClearance } from './cash-clearance';

export const metadata: Metadata = { title: 'Cash clearance' };

export default function CashClearancePage() {
  return (
    <>
      <PageHeader
        title="Cash clearance"
        description="Cash collected by providers in the field and not yet handed in."
      />
      <PermissionGate capability="finance.read">
        <CashClearance />
      </PermissionGate>
    </>
  );
}
