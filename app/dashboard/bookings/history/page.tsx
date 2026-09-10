import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/rbac/permission-gate';
import { ArchiveTable } from './archive-table';

export const metadata: Metadata = { title: 'Invoice archive' };

export default function BookingHistoryPage() {
  return (
    <>
      <PageHeader
        title="Invoice archive"
        description="Closed bookings and the receipts they were settled on. Open one to read or print the finalized invoice."
      />
      <PermissionGate capability="bookings.read">
        <ArchiveTable />
      </PermissionGate>
    </>
  );
}
