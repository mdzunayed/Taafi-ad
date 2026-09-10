'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { SupplyFormSheet, CATEGORY_LABEL } from './supply-form-sheet';
import {
  deleteSupply,
  listSupplies,
  updateSupply,
  SUPPLY_CATEGORIES,
  type SupplyWire,
} from '@/lib/api/supplies';
import { normalizeError } from '@/lib/api/errors';
import { qk } from '@/lib/api/query-keys';
import { money } from '@/lib/format';
import { PERMISSIONS } from '@/lib/rbac/permissions';

/**
 * The consumables catalog, grouped by shelf category.
 *
 * Grouped rather than flat, and filtered in the browser rather than on the
 * server, for the same reason the invoice picker is: this is a few hundred rows
 * that an operator scans rather than pages through, and a round-trip per
 * keystroke would make the search feel worse than no search. `GET
 * /admin/supplies` is deliberately unpaginated to support that.
 *
 * NOT built on `ContentCollection` — same call `services-table.tsx` made. The
 * shared table renders one flat list; this renders a heading per category with
 * its own rows beneath, which is a different table rather than a configured
 * one.
 */
export function SuppliesTable() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<SupplyWire | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<SupplyWire | null>(null);

  const query = useQuery({ queryKey: qk.supplies, queryFn: listSupplies });

  const toggle = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      updateSupply(input.id, { isActive: input.isActive }),
    onMutate: (input) => setBusyId(input.id),
    onSuccess: () => {
      toast.success('Updated.');
      void queryClient.invalidateQueries({ queryKey: qk.supplies });
    },
    onError: (error) => toast.error(normalizeError(error).message),
    onSettled: () => setBusyId(null),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSupply(id),
    onSuccess: () => {
      toast.success('Supply deleted.');
      void queryClient.invalidateQueries({ queryKey: qk.supplies });
    },
    onError: (error) => toast.error(normalizeError(error).message),
  });

  const grouped = useMemo(() => {
    const rows = query.data ?? [];
    const needle = search.trim().toLowerCase();
    const matched = needle
      ? rows.filter(
          (s) =>
            s.name.toLowerCase().includes(needle) ||
            (s.description ?? '').toLowerCase().includes(needle) ||
            s.category.includes(needle),
        )
      : rows;

    // Fixed category order rather than first-appearance, so the page does not
    // reshuffle its headings as rows are added.
    return SUPPLY_CATEGORIES.map((category) => ({
      category,
      rows: matched
        .filter((s) => s.category === category)
        .sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((group) => group.rows.length > 0);
  }, [query.data, search]);

  const total = query.data?.length ?? 0;
  const matchedCount = grouped.reduce((sum, g) => sum + g.rows.length, 0);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(supply: SupplyWire) {
    setEditing(supply);
    setFormOpen(true);
  }

  if (query.isError) {
    return (
      <ApiErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        permission={PERMISSIONS.MANAGE_BOOKINGS}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search medicines, dressings, equipment…"
            className="pl-8"
          />
        </div>
        <DisabledWhenDenied
          capability="content.write"
          reason="You can bill from this catalog but not curate it. Ask an admin to add a supply."
        >
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Add supply
          </Button>
        </DisabledWhenDenied>
      </div>

      {query.isPending ? (
        <TableSkeleton cols={5} />
      ) : total === 0 ? (
        <EmptyState
          icon={Package}
          title="No supplies yet"
          description="Add the medicines, dressings and equipment your teams bill for. They become searchable in every invoice editor."
        />
      ) : matchedCount === 0 ? (
        <EmptyState
          icon={Search}
          title="No match"
          description={`Nothing in the catalog matches “${search.trim()}”.`}
        />
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <div key={group.category} className="space-y-2">
              <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {CATEGORY_LABEL[group.category]}
                <span className="ml-2 font-normal normal-case">
                  {group.rows.length}
                </span>
              </h3>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-32 text-right">Unit price</TableHead>
                      <TableHead className="w-24">Unit</TableHead>
                      <TableHead className="w-28">Available</TableHead>
                      <TableHead className="w-24 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.rows.map((supply) => (
                      <TableRow key={supply.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{supply.name}</span>
                            {supply.description && (
                              <span className="text-muted-foreground text-xs">
                                {supply.description}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(supply.unitPrice)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-normal">
                            {supply.unit}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DisabledWhenDenied
                            capability="content.write"
                            reason="Only content staff can change the catalog."
                          >
                            <Switch
                              checked={supply.isActive}
                              disabled={busyId === supply.id}
                              onCheckedChange={(next) =>
                                toggle.mutate({ id: supply.id, isActive: next })
                              }
                            />
                          </DisabledWhenDenied>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <DisabledWhenDenied
                              capability="content.write"
                              reason="Only content staff can change the catalog."
                            >
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => openEdit(supply)}
                                aria-label={`Edit ${supply.name}`}
                              >
                                <Pencil className="size-4" />
                              </Button>
                            </DisabledWhenDenied>
                            <DisabledWhenDenied
                              capability="content.write"
                              reason="Only content staff can change the catalog."
                            >
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setDeleting(supply)}
                                aria-label={`Delete ${supply.name}`}
                              >
                                <Trash2 className="text-destructive size-4" />
                              </Button>
                            </DisabledWhenDenied>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </div>
      )}

      <SupplyFormSheet
        supply={editing}
        open={formOpen}
        onOpenChange={setFormOpen}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'this supply'}?`}
        /* Says what delete does NOT do. An operator's real worry here is
           whether removing a shelf row rewrites bills that already quoted it —
           it does not, because line items snapshot their own price. Turning it
           off is still the better move for something merely out of stock, so
           the copy offers that first. */
        description="Invoices that already billed this supply keep their line item and its price — nothing is rewritten. If it is only out of stock, switch Available off instead so it stays on past bills and off the picker."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
          setDeleting(null);
        }}
      />
    </div>
  );
}
