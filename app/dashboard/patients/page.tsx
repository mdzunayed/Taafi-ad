import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/rbac/permission-gate';
import { PatientsTable } from './patients-table';

export const metadata: Metadata = { title: 'Patients' };

export default function PatientsPage() {
  return (
    <>
      <PageHeader
        title="Patients"
        description="Registered patient accounts, newest first."
      />
      <PermissionGate capability="patients.read">
        <PatientsTable />
      </PermissionGate>
    </>
  );
}
