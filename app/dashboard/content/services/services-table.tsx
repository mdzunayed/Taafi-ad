'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Search, Trash2 } from 'lucide-react';
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
import { ServiceFormSheet } from './service-form-sheet';
import {
  categories,
  services,
  type CategoryWire,
  type ServiceWire,
} from '@/lib/api/content';
import { normalizeError } from '@/lib/api/errors';
import { qk } from '@/lib/api/query-keys';
import { money } from '@/lib/format';

const PROVIDER_LABEL: Record<string, string> = {
  DOCTOR: 'Doctor',
  NURSE: 'Nurse',
  PHYSIOTHERAPIST: 'Physiotherapist',
  LAB_TECH: 'Lab technician',
};

/**
 * No figure pinned — the cost is settled on the review call.
 *
 * Deliberately a badge rather than `money()`'s em-dash: an em-dash in a money
 * column reads as missing data, and this is a decision.
 */
function VariableFee() {
  return (
    <Badge variant="secondary" className="font-normal">
      Variable / Unset
    </Badge>
  );
}

const UNGROUPED = '__ungrouped__';

/**
 * The catalog, grouped under the category pill each service sits on.
 *
 * NOT built on `ContentCollection`, and this is the second surface to step away
 * from it (see home-sections-table.tsx for the first). The shared table renders
 * one flat list; this one renders a heading per category with its own rows
 * beneath, which is a different table rather than a configured one. The
 * list/toggle/delete plumbing is small enough to carry.
 *
 * GROUPED BY THE PRIMARY CATEGORY ONLY. A service can be assigned to several
 * pills, and listing it under each would show one row several times — an
 * operator toggling it off in one group would watch it disappear from the
 * others, which reads as a bug. The first `categoryIds` entry is "primary"
 * everywhere else in the system (`resolveCategorySlugs` on the server picks the
 * same one for the badge), so it decides the group here too. Services carrying
 * only the legacy free-text `category` fall to the bottom group.
 */
export function ServicesTable() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ServiceWire | null>(null);

  const query = useQuery({ queryKey: qk.services, queryFn: services.list });
  const categoryQuery = useQuery({ queryKey: qk.categories, queryFn: categories.list });

  const toggle = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      services.setActive(input.id, input.isActive),
    onMutate: (input) => setBusyId(input.id),
    onSuccess: () => {
      toast.success('Updated.');
      void queryClient.invalidateQueries({ queryKey: qk.services });
    },
    onError: (error) => toast.error(normalizeError(error).message),
    onSettled: () => setBusyId(null),
  });

  const remove = useMutation({
    mutationFn: (id: string) => services.remove(id),
    onSuccess: () => {
      toast.success('Removed.');
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: qk.services });
    },
    onError: (error) => toast.error(normalizeError(error).message),
  });

  const groups = useMemo(() => {
    const byId = new Map<string, CategoryWire>(
      (categoryQuery.data ?? []).map((c) => [c.id, c]),
    );

    const term = search.trim().toLowerCase();
    const rows = (query.data ?? []).filter(
      (s) =>
        !term ||
        String(s.title ?? '').toLowerCase().includes(term) ||
        String(s.description ?? '').toLowerCase().includes(term),
    );

    const buckets = new Map<string, { label: string; rows: ServiceWire[] }>();
    for (const service of rows) {
      const primary = service.categoryIds?.[0];
      const matched = primary ? byId.get(primary) : undefined;
      // Three tiers, in descending confidence: an explicit assignment, the
      // legacy free-text label, then nothing at all.
      const key = matched ? matched.id : service.category?.trim() || UNGROUPED;
      const label = matched
        ? (matched.nameEn ?? matched.slug ?? 'Category')
        : service.category?.trim() || 'Uncategorised';
      if (!buckets.has(key)) buckets.set(key, { label, rows: [] });
      buckets.get(key)!.rows.push(service);
    }

    return [...buckets.entries()]
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => {
        // Uncategorised last; it is a to-do list, not a category.
        if (a.key === UNGROUPED) return 1;
        if (b.key === UNGROUPED) return -1;
        return a.label.localeCompare(b.label);
      });
  }, [query.data, categoryQuery.data, search]);

  if (query.isError) {
    return <ApiErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search services"
            className="pl-8"
            aria-label="Search services"
          />
        </div>
        <ServiceFormSheet />
      </div>

      {query.isPending ? (
        <TableSkeleton cols={7} />
      ) : total === 0 ? (
        <EmptyState
          title={search.trim() ? 'No services match' : 'No services yet'}
          description={
            search.trim()
              ? 'Try a different search.'
              : 'Add a service so patients have something to book.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Provider type</TableHead>
                <TableHead className="text-right tabular-nums">
                  Estimated fee
                </TableHead>
                <TableHead className="text-right tabular-nums">Deposit</TableHead>
                <TableHead className="w-12" />
                <TableHead className="w-24">Live</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            {groups.map((group) => (
              <TableBody key={group.key}>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableCell colSpan={7} className="py-2">
                    <span className="text-xs font-medium tracking-wide uppercase">
                      {group.label}
                    </span>
                    <span className="text-muted-foreground ml-2 text-xs tabular-nums">
                      {group.rows.length}
                    </span>
                  </TableCell>
                </TableRow>
                {group.rows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium">{s.title ?? s.titleEn ?? '—'}</div>
                      {s.description ? (
                        <div className="text-muted-foreground max-w-[320px] truncate text-xs">
                          {s.description}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {!s.provider_type ? (
                        '—'
                      ) : s.provider_type_source === 'inferred' ? (
                        // `inferred` means no admin ever tagged it — the role
                        // was read off the title. Worth showing, because it is
                        // what words the patient's tracker.
                        <span className="text-muted-foreground">
                          {PROVIDER_LABEL[s.provider_type] ?? s.provider_type} (inferred)
                        </span>
                      ) : (
                        (PROVIDER_LABEL[s.provider_type] ?? s.provider_type)
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {/* No `?? s.price` fallback: `price` is a legacy mirror the
                          server writes for the patient app's sort, not something
                          this console should present as an admin's answer. */}
                      {s.defaultBaseFee == null ? (
                        <VariableFee />
                      ) : (
                        money(s.defaultBaseFee)
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.defaultAdvanceDeposit == null ? (
                        <VariableFee />
                      ) : (
                        // A deposit the server filled in from the platform
                        // default is real, but it is not this service's
                        // decision — muted so a pinned figure stands out.
                        <span
                          className={
                            s.default_advance_deposit_source === 'platform_default'
                              ? 'text-muted-foreground'
                              : undefined
                          }
                        >
                          {money(s.defaultAdvanceDeposit)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ServiceFormSheet service={s} />
                    </TableCell>
                    <TableCell>
                      <DisabledWhenDenied
                        capability="content.write"
                        reason="Only an admin can change what patients see."
                      >
                        <Switch
                          checked={Boolean(s.isActive)}
                          disabled={busyId === s.id}
                          onCheckedChange={(v) =>
                            toggle.mutate({ id: s.id, isActive: v })
                          }
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
                          onClick={() => setDeleting(s)}
                          aria-label="Delete"
                        >
                          {remove.isPending && deleting?.id === s.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </Button>
                      </DisabledWhenDenied>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            ))}
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Remove this service?"
        description={
          <p>
            It disappears from the patient app immediately and can no longer be
            booked. This cannot be undone from here.
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
