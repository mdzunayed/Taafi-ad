import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/rbac/permission-gate';
import { VerificationQueue } from './verification-queue';

export const metadata: Metadata = { title: 'Doctor verification' };

/**
 * The credentialing queue: every provider waiting on a decision, and nothing
 * else.
 *
 * The roster at /dashboard/providers can already open the same review sheet,
 * but it is a roster — a verified doctor of two years and an application filed
 * this morning are two rows in one table, distinguishable only by a badge. The
 * queue is the work: it holds only what is undecided, oldest first, so
 * "is anyone waiting on us?" is answered by the page being empty.
 */
export default function DoctorVerificationPage() {
  return (
    <>
      <PageHeader
        title="Doctor verification"
        description="Providers awaiting a credentialing decision. Review the BMDC registration and identity documents, then approve, reject, or ask for a clearer upload — the reason you write is sent to them by SMS."
      />
      <PermissionGate capability="providers.read">
        <VerificationQueue />
      </PermissionGate>
    </>
  );
}
