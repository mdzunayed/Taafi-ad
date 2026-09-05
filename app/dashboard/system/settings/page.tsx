import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/rbac/permission-gate';
import { SettingsForm } from './settings-form';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
  return (
    /**
     * Read access is intentionally broad — support staff need to be able to
     * answer "what is the deposit right now?". Writing is gated separately
     * inside the form, which renders read-only for anyone without
     * manage_settings rather than showing them a 403 banner.
     */
    <>
      <PageHeader
        title="Platform settings"
        description="Global configuration for dispatch, pricing and the patient app."
      />
      <PermissionGate capability="settings.read">
        <SettingsForm />
      </PermissionGate>
    </>
  );
}
