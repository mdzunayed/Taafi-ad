'use client';

import { ContentCollection } from '../content-collection';
import { CategoryFormDialog } from './category-form-dialog';
import { categories, type CategoryWire } from '@/lib/api/content';
import { qk } from '@/lib/api/query-keys';

export function CategoriesTable() {
  return (
    <ContentCollection<CategoryWire>
      title="Categories"
      queryKey={qk.categories}
      emptyHint="Add a category so services have a pill to appear under."
      api={categories}
      // The rail is left-to-right in this order, and only the first few pills
      // are visible at phone width — which is the whole reason this ordering
      // matters enough to drag.
      orderField="displayOrder"
      rowLabel="category"
      toolbar={
        <div className="flex justify-end">
          <CategoryFormDialog />
        </div>
      }
      rowActions={(c) => <CategoryFormDialog category={c} />}
      columns={[
        {
          header: 'Name',
          cell: (c) => <span className="font-medium">{c.nameEn ?? '—'}</span>,
        },
        {
          header: 'Bengali',
          cell: (c) => c.nameBn ?? '—',
        },
        {
          header: 'Slug',
          cell: (c) => (
            <span className="text-muted-foreground font-mono text-xs">
              {c.slug ?? '—'}
            </span>
          ),
        },
        {
          // Separate from the Live switch on the right: a category can be
          // active and joinable without earning a slot on the phone rail.
          header: 'Home rail',
          cell: (c) =>
            c.showOnHomeRail === false ? (
              <span className="text-muted-foreground">Hidden</span>
            ) : (
              'Pill'
            ),
        },
        {
          header: 'Order',
          className: 'tabular-nums',
          cell: (c) => c.displayOrder ?? '—',
        },
      ]}
    />
  );
}
