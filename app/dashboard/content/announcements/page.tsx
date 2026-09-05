import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/rbac/permission-gate';
import { AnnouncementsTable } from './announcements-table';

export const metadata: Metadata = { title: 'Announcements' };

export default function AnnouncementsPage() {
  return (
    <>
      <PageHeader
        title="Announcements"
        description="Bulletins patients can open and read. Each one is also a slide in the home carousel — the Banners tab is the same rows, arranged for the carousel rather than written for reading."
      />
      <PermissionGate capability="content.read">
        <AnnouncementsTable />
      </PermissionGate>
    </>
  );
}
