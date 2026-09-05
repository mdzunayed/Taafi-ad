import type { Metadata } from 'next';

import { PermissionGate } from '@/components/rbac/permission-gate';
import { PatientDetail } from './patient-detail';

export const metadata: Metadata = { title: 'Patient' };

/**
 * This page renders `medical_vault` — protected health information.
 *
 * `force-dynamic` keeps it out of every prerender and cache layer. The vault
 * itself sits behind an explicit reveal in the component, and nothing on this
 * route is persisted to browser storage.
 */
export const dynamic = 'force-dynamic';

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PermissionGate capability="patients.read">
      <PatientDetail id={id} />
    </PermissionGate>
  );
}
