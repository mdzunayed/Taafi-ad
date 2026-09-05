import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/rbac/permission-gate';
import { AuditLogTable } from './audit-log-table';

export const metadata: Metadata = { title: 'Audit log' };

export default function AuditLogPage() {
  return (
    /**
     * `support_member` lands on the polite banner here rather than a broken
     * page — this is the mirror check. If the mirror is ever wrong, the API
     * answers 403 `missing_permission` and `<ApiErrorState>` renders the same
     * banner from the server's own `required[]`.
     */
    <>
      <PageHeader
        title="Audit log"
        description="Every administrative action, newest first. Append-only — there is no way to edit or delete a row."
      />
      <PermissionGate capability="audit.read">
        <AuditLogTable />
      </PermissionGate>
    </>
  );
}
