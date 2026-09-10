'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { ApiErrorState } from '@/components/rbac/api-error-state';
import { DisabledWhenDenied } from '@/components/rbac/can';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EmptyState, TableSkeleton } from '@/components/data/states';
import {
  DragHandleCell,
  SortableTable,
  useOptimisticReorder,
} from '@/components/data/sortable-table';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CARE_SERVICES_KEY,
  homeSections,
  type HomeSectionWire,
} from '@/lib/api/content';
import { normalizeError } from '@/lib/api/errors';
import { qk } from '@/lib/api/query-keys';
import { humanize } from '@/lib/format';
import { SectionFormSheet } from './section-form-sheet';

/**
 * The server-driven rows below Banners and Care Services on the patient home
 * feed, in the order they render.
 *
 * Still not built on `ContentCollection`, though that component now reorders
 * too. What keeps this one separate is the `CARE_SERVICES` filter below: the
 * shared table renders the collection it is given, and this page must show a
 * strict subset of it while leaving the hidden row untouched in the cache. The
 * drag plumbing itself is shared — both go through `sortable-table`.
 *
 * `CARE_SERVICES` is filtered out: it is an ordinary section with a reserved
 * key, but the patient renderer draws it above this list from its own block, so
 * showing it here would imply it can be reordered among these. Its layout is
 * owned by the panel above.
 */
export function HomeSectionsTable() {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<HomeSectionWire | null>(null);

  const query = useQuery({ queryKey: qk.homeSections, queryFn: homeSections.list });

  const rows = (query.data ?? [])
    .filter((s) => s.sectionKey !== CARE_SERVICES_KEY)
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

  const toggle = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      homeSections.setActive(input.id, input.isActive),
    onMutate: (input) => setBusyId(input.id),
    onSuccess: () => {
      toast.success('Updated.');
      void queryClient.invalidateQueries({ queryKey: qk.homeSections });
    },
    onError: (error) => toast.error(normalizeError(error).message),
    onSettled: () => setBusyId(null),
  });

  const remove = useMutation({
    mutationFn: (id: string) => homeSections.remove(id),
    onSuccess: () => {
      toast.success('Removed.');
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: qk.homeSections });
    },
    onError: (error) => toast.error(normalizeError(error).message),
  });

  /**
   * Sends the FULL id list in its new order; the server renumbers `orderIndex`
   * to 0..n-1 in one write. Care Services is excluded from `rows` but keeps its
   * own `orderIndex` of -1, so it stays above everything regardless — and the
   * shared hook preserves rows missing from `ids` for exactly that reason.
   */
  const reorder = useOptimisticReorder<HomeSectionWire>({
    queryKey: qk.homeSections,
    mutationFn: (ids) => homeSections.reorder(ids),
    orderField: 'orderIndex',
  });

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const ids = rows.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate(ids);
  }

  if (query.isError) {
    return <ApiErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  /*
   * The create button sits outside every branch below, including the empty
   * state — an empty list is precisely when an operator needs it, and it used
   * to be the one screen with no way forward.
   */
  const toolbar = (
    <div className="flex justify-end">
      <SectionFormSheet />
    </div>
  );

  if (query.isPending) {
    return (
      <div className="space-y-4">
        {toolbar}
        <TableSkeleton cols={10} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        {toolbar}
        <EmptyState
          title="No home sections yet"
          description="Sections created here render below Care Services on the patient home feed."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toolbar}
      <div className="rounded-md border">
        <SortableTable
          items={rows}
          disabled={reorder.isPending}
          onReorder={(ids) => reorder.mutate(ids)}
          header={
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Title</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Template</TableHead>
                <TableHead className="tabular-nums">Cards</TableHead>
                <TableHead className="tabular-nums">Order</TableHead>
                <TableHead className="w-12" />
                <TableHead className="w-24">Move</TableHead>
                <TableHead className="w-24">Live</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
          }
        >
            {(row, index) => (
              <>
                <DragHandleCell label={row.titleEn ?? 'section'} />
                <TableCell className="font-medium">
                  {row.titleEn ?? row.sectionKey ?? '—'}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {row.sectionKey ?? '—'}
                </TableCell>
                <TableCell>{humanize(row.uiTemplate)}</TableCell>
                <TableCell className="tabular-nums">
                  {row.contentData?.length ?? 0}
                </TableCell>
                <TableCell className="tabular-nums">{row.orderIndex ?? '—'}</TableCell>
                <TableCell>
                  <SectionFormSheet section={row} />
                </TableCell>
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
                        aria-label={`Move ${row.titleEn ?? 'section'} up`}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={index === rows.length - 1 || reorder.isPending}
                        onClick={() => move(index, 1)}
                        aria-label={`Move ${row.titleEn ?? 'section'} down`}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                    </div>
                  </DisabledWhenDenied>
                </TableCell>
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
            )}
        </SortableTable>
      </div>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Remove this section?"
        description={
          <p>
            It disappears from the patient home feed immediately, along with its
            cards. This cannot be undone from here.
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
