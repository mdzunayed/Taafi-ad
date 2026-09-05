import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/rbac/permission-gate';
import { ManualBookingForm } from './manual-booking-form';

export const metadata: Metadata = { title: 'Manual booking' };

export default function NewBookingPage() {
  return (
    <>
      <PageHeader
        title="Create Manual Booking"
        description="For a patient on the phone. If their number has no account yet, one is created and the booking appears in their app as soon as they sign in."
      />
      <PermissionGate capability="bookings.create">
        <ManualBookingForm />
      </PermissionGate>
    </>
  );
}
