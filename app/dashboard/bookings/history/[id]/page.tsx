import type { Metadata } from 'next';

import { PermissionGate } from '@/components/rbac/permission-gate';
import { ArchivedBookingDetail } from './archived-booking-detail';

export const metadata: Metadata = { title: 'Archived invoice' };

export default async function ArchivedBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PermissionGate capability="bookings.read">
      <ArchivedBookingDetail id={id} />
    </PermissionGate>
  );
}
