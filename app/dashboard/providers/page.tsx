import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/rbac/permission-gate';
import { ProvidersTable } from './providers-table';

export const metadata: Metadata = { title: 'Providers' };

export default function ProvidersPage() {
  return (
    <>
      <PageHeader
        title="Providers"
        description="The doctor, nurse and helper roster. Verify licences, review uploaded credentials and manage account status."
      />
      <PermissionGate capability="providers.read">
        <ProvidersTable />
      </PermissionGate>
    </>
  );
}
