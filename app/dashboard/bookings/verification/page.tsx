import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/rbac/permission-gate';
import { VerificationQueues } from './verification-queues';

export const metadata: Metadata = { title: 'Payment verification' };

export default function VerificationPage() {
  return (
    <>
      <PageHeader
        title="Payment verification"
        description="Manual bank and mobile-money claims waiting to be matched against a real credit. Oldest first."
      />
      <PermissionGate capability="bookings.read">
        <VerificationQueues />
      </PermissionGate>
    </>
  );
}
