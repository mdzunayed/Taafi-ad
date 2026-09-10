import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/rbac/permission-gate';
import { ServicesTable } from './services-table';

export const metadata: Metadata = { title: 'Services' };

export default function ServicesPage() {
  return (
    <>
      <PageHeader
        title="Service catalog"
        description="What patients can book, and below it the internal charges only the back office can bill. Hiding a service stops new bookings without touching the ones in flight."
      />
      <PermissionGate capability="content.read">
        <ServicesTable />
      </PermissionGate>
    </>
  );
}
