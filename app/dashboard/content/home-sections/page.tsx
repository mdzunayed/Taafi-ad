import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/rbac/permission-gate';
import { CareServicesPanel } from './care-services-panel';
import { HomeSectionsTable } from './home-sections-table';

export const metadata: Metadata = { title: 'Home sections' };

export default function HomeSectionsPage() {
  return (
    <>
      <PageHeader
        title="Home sections"
        description="The server-driven rows that make up the patient home feed."
      />
      <PermissionGate capability="content.read">
        <div className="space-y-6">
          <CareServicesPanel />
          <HomeSectionsTable />
        </div>
      </PermissionGate>
    </>
  );
}
