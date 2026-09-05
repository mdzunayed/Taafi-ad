import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/rbac/permission-gate';
import { BannersTable } from './banners-table';

export const metadata: Metadata = { title: 'Banners' };

export default function BannersPage() {
  return (
    <>
      <PageHeader
        title="Promo banners"
        description="The carousel at the top of the patient home screen."
      />
      <PermissionGate capability="content.read">
        <BannersTable />
      </PermissionGate>
    </>
  );
}
