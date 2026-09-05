import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/rbac/permission-gate';

import { RxQueueTable } from './rx-queue-table';

export const metadata: Metadata = { title: 'Rx Approvals' };

export default function RxApprovalsPage() {
  return (
    <>
      <PageHeader
        title="Rx Approvals"
        description="Prescription drafts awaiting a clinical sign-off, oldest first. Approving locks the script against further edits by the doctor."
      />
      <PermissionGate capability="prescriptions.read">
        <RxQueueTable mode="queue" />
      </PermissionGate>
    </>
  );
}
