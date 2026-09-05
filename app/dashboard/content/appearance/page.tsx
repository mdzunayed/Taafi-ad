import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/rbac/permission-gate';
import { AppearanceForm } from './appearance-form';

export const metadata: Metadata = { title: 'Appearance' };

export default function AppearancePage() {
  return (
    <>
      <PageHeader
        title="Home appearance"
        description="How tall the hero is, and how the Care Services grid is laid out."
      />
      {/* `content.read`, matching every other CMS page — and matching the
          server, which gates `/api/home-layout` on manage_content rather than
          manage_settings. Hero height is what the patient home LOOKS like, so
          it belongs to whoever curates the banners it lays out. */}
      <PermissionGate capability="content.read">
        <AppearanceForm />
      </PermissionGate>
    </>
  );
}
