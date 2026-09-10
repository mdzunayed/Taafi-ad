'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiErrorState } from '@/components/rbac/api-error-state';
import { DisabledWhenDenied } from '@/components/rbac/can';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EmptyState, TableSkeleton } from '@/components/data/states';
import {
  DragHandleCell,
  SortableTable,
  useOptimisticReorder,
} from '@/components/data/sortable-table';
import { normalizeError } from '@/lib/api/errors';
import type { CmsItem } from '@/lib/api/content';

export interface Column<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

interface Collection<T> {
  list: () => Promise<T[]>;
  setActive: (id: string, isActive: boolean) => Promise<T>;
  remove: (id: string) => Promise<{ ok: boolean }>;
  /**
   * Present on the ordered collections only. Supplying `orderField` alongside
   * it (see props) is what turns reordering on — a collection whose rows have
   * no meaningful sequence, like services, passes neither and renders exactly
   * the table it always had.
   */
  reorder?: (ids: string[]) => Promise<T[]>;
}

/**
 * Shared table for the five CMS surfaces.
 *
 * They differ only in their columns, so the list/toggle/delete plumbing —
 * including the `{ok: true}` delete envelope that is unique to these routes —
 * lives here once.
 */
export function ContentCollection<T extends CmsItem>({
  title,
  queryKey,
  api,
  columns,
  emptyHint,
  toolbar,
  rowActions,
  orderField,
  rowLabel,
}: {
  title: string;
  queryKey: readonly unknown[];
  api: Collection<T>;
  columns: Column<T>[];
  emptyHint?: string;
  toolbar?: React.ReactNode;
  /**
   * Per-row controls (an edit dialog, say), rendered between the last column
   * and the Live switch. Optional: the surfaces that only list/toggle/delete
   * pass nothing and get exactly the table they had before this existed.
   */
  rowActions?: (row: T) => React.ReactNode;
  /**
   * The order column on this collection (`priorityOrder`, `displayOrder`).
   * Supplying it — together with an `api.reorder` — adds the drag handle and
   * the ↑/↓ column, and makes this table sort by that field rather than
   * trusting the order the list arrived in.
   */
  orderField?: string;
  /** Names a row in the reorder controls' labels, e.g. "banner". */
  rowLabel?: string;
}) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState<T | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useQuery({ queryKey, queryFn: api.list });

  const sortable = Boolean(api.reorder && orderField);

  /**
   * Sorting locally rather than trusting arrival order: the optimistic reorder
   * patch rewrites `orderField` on the cached rows, and the row positions have
   * to follow it before the refetch lands or the drop appears to do nothing.
   */
  const rows = useMemo(() => {
    const data = query.data ?? [];
    if (!sortable || !orderField) return data;
    return [...data].sort(
      (a, b) =>
        (Number(a[orderField as keyof T] ?? 0) || 0) -
        (Number(b[orderField as keyof T] ?? 0) || 0),
    );
  }, [query.data, sortable, orderField]);

  const reorder = useOptimisticReorder<T>({
    queryKey,
    // Only ever invoked when `sortable` is true, which implies `api.reorder`.
    mutationFn: (ids) => api.reorder!(ids),
    orderField,
  });

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const ids = rows.map((r) => r.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate(ids);
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const toggle = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      api.setActive(input.id, input.isActive),
    onMutate: (input) => setBusyId(input.id),
    onSuccess: () => {
      toast.success('Updated.');
      invalidate();
    },
    onError: (error) => toast.error(normalizeError(error).message),
    onSettled: () => setBusyId(null),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.remove(id),
    onSuccess: () => {
      toast.success('Removed.');
      invalidate();
    },
    onError: (error) => toast.error(normalizeError(error).message),
  });

  if (query.isError) {
    return <ApiErrorState error={query.error} onRetry={() => query.refetch()} />;
  }

  /**
   * The cells of one row, minus the drag handle. Shared verbatim by the
   * sortable and plain bodies so the two paths cannot drift into rendering
   * different tables.
   */
  const rowCells = (row: T, index: number) => (
    <>
      {columns.map((c) => (
        <TableCell key={c.header} className={c.className}>
          {c.cell(row)}
        </TableCell>
      ))}
      {rowActions ? <TableCell>{rowActions(row)}</TableCell> : null}
      {sortable ? (
        <TableCell>
          <DisabledWhenDenied
            capability="content.write"
            reason="Only an admin can change what patients see."
          >
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={index === 0 || reorder.isPending}
                onClick={() => move(index, -1)}
                aria-label={`Move ${rowLabel ?? 'item'} up`}
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={index === rows.length - 1 || reorder.isPending}
                onClick={() => move(index, 1)}
                aria-label={`Move ${rowLabel ?? 'item'} down`}
              >
                <ArrowDown className="size-4" />
              </Button>
            </div>
          </DisabledWhenDenied>
        </TableCell>
      ) : null}
      <TableCell>
        <DisabledWhenDenied
          capability="content.write"
          reason="Only an admin can change what patients see."
        >
          <Switch
            checked={Boolean(row.isActive)}
            disabled={busyId === row.id}
            onCheckedChange={(v) => toggle.mutate({ id: row.id, isActive: v })}
            aria-label="Visible in the patient app"
          />
        </DisabledWhenDenied>
      </TableCell>
      <TableCell>
        <DisabledWhenDenied
          capability="content.write"
          reason="Only an admin can remove content."
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDeleting(row)}
            aria-label="Delete"
          >
            {remove.isPending && deleting?.id === row.id ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
          </Button>
        </DisabledWhenDenied>
      </TableCell>
    </>
  );

  /** Shared by both bodies for the same reason `rowCells` is. */
  const tableHead = (
    <TableHeader>
      <TableRow>
        {sortable ? <TableHead className="w-10" /> : null}
        {columns.map((c) => (
          <TableHead key={c.header} className={c.className}>
            {c.header}
          </TableHead>
        ))}
        {rowActions ? <TableHead className="w-16" /> : null}
        {sortable ? <TableHead className="w-24">Move</TableHead> : null}
        <TableHead className="w-24">Live</TableHead>
        <TableHead className="w-16" />
      </TableRow>
    </TableHeader>
  );

  return (
    <div className="space-y-4">
      {toolbar}

      {query.isLoading ? (
        <TableSkeleton
          cols={
            columns.length + (rowActions ? 3 : 2) + (sortable ? 2 : 0)
          }
        />
      ) : !rows.length ? (
        <EmptyState title={`No ${title.toLowerCase()} yet`} description={emptyHint} />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          {sortable ? (
            // The sortable path owns its own `<Table>`, so that dnd-kit's
            // context — and the accessibility `div`s it renders — stay outside
            // the table element. Both paths render the same header.
            <SortableTable
              items={rows}
              disabled={reorder.isPending}
              onReorder={(ids) => reorder.mutate(ids)}
              header={tableHead}
            >
              {(row, index) => (
                <>
                  <DragHandleCell label={rowLabel ?? 'item'} />
                  {rowCells(row, index)}
                </>
              )}
            </SortableTable>
          ) : (
            <Table>
              {tableHead}
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={row.id}>{rowCells(row, index)}</TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Remove this item?"
        description={
          <p>
            It disappears from the patient app immediately. This cannot be
            undone from here.
          </p>
        }
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />
    </div>
  );
}

export function ActiveBadge({ value }: { value: unknown }) {
  return (
    <Badge variant={value ? 'default' : 'secondary'}>
      {value ? 'Live' : 'Hidden'}
    </Badge>
  );
}
