import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/rbac/permission-gate';

import { RxQueueTable } from '../rx-queue-table';

export const metadata: Metadata = { title: 'Decided prescriptions' };

export default function DecidedRxPage() {
  return (
    <>
      <PageHeader
        title="Decided prescriptions"
        description="Scripts that have already been signed off, rejected, or sent back to the prescribing doctor."
      />
      <PermissionGate capability="prescriptions.read">
        <RxQueueTable mode="decided" />
      </PermissionGate>
    </>
  );
}
