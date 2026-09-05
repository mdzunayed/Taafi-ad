import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { OverviewContent } from './overview-content';

export const metadata: Metadata = { title: 'Overview' };

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        title="Overview"
        description="Live platform activity across bookings, dispatch and revenue."
      />
      <OverviewContent />
    </>
  );
}
