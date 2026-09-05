import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/rbac/permission-gate';
import { CategoriesTable } from './categories-table';

export const metadata: Metadata = { title: 'Categories' };

export default function CategoriesPage() {
  return (
    <>
      <PageHeader
        title="Categories"
        description="The grouping patients browse on the home screen. Order here is the order they see."
      />
      <PermissionGate capability="content.read">
        <CategoriesTable />
      </PermissionGate>
    </>
  );
}
