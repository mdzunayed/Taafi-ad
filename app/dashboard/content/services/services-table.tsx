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
import {
  DataCard,
  DataCardActions,
  DataCardBody,
  DataCardField,
  DataCardGroupHeading,
  DataCardHeader,
  ResponsiveTable,
} from '@/components/data/responsive-table';
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
 *
 * BACK-OFFICE ROWS ARE NOT A GROUP IN THIS TABLE. They are pulled out ahead of
 * any category test and rendered by `InternalServices` below, under its own
 * heading and its own table. They are billable-but-unbookable charges — a
 * callout surcharge, a disposal fee — and a heading row inside the storefront
 * table still reads as one more category of thing a patient might book. Its own
 * section says the opposite plainly, and says it once.
 *
 * The pull-out is BY FLAG ALONE and ignores `categoryIds` entirely. A row can
 * still carry pills from before it was made back-office; the server filters it
 * out of the public catalog regardless, so grouping on those assignments would
 * only disagree with what patients actually see.
 *
 * ONE SEARCH BOX FILTERS BOTH SECTIONS. An operator who types "callout" and
 * sees an empty storefront has not been told the catalog is empty — the row
 * they wanted is in the section below, still matching. So each section reports
 * its own miss and the page only shows the full empty state when neither has
 * anything.
 */
export function ServicesTable() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ServiceWire | null>(null);

  // `listAll`, not `list`: the public list excludes back-office rows in the
  // database query, which is why the Internal services section below could only
  // ever report itself empty. Every picker in the console stays on `list`.
  const query = useQuery({ queryKey: qk.servicesAll, queryFn: services.listAll });
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

  const { groups, internal } = useMemo(() => {
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
    const internalRows: ServiceWire[] = [];

    for (const service of rows) {
      // Tested before the category lookup, so a back-office row never lands in
      // a storefront section even when it still carries a pill.
      if (service.isAdminOnly) {
        internalRows.push(service);
        continue;
      }
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

    // Alphabetical. The storefront groups inherit an order from their category
    // pills; this list has no pills to inherit from, so name is the only thing
    // an operator can predict a row's position from.
    internalRows.sort((a, b) =>
      String(a.title ?? a.titleEn ?? '').localeCompare(
        String(b.title ?? b.titleEn ?? ''),
      ),
    );

    return {
      groups: [...buckets.entries()]
        .map(([key, value]) => ({ key, ...value }))
        .sort((a, b) => {
          // Uncategorised last; it is a to-do list, not a category.
          if (a.key === UNGROUPED) return 1;
          if (b.key === UNGROUPED) return -1;
          return a.label.localeCompare(b.label);
        }),
      internal: internalRows,
    };
  }, [query.data, categoryQuery.data, search]);

  if (query.isError) {
    return <ApiErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const publicTotal = groups.reduce((n, g) => n + g.rows.length, 0);
  const total = publicTotal + internal.length;
  const searching = search.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-56">
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
          title={searching ? 'No services match' : 'No services yet'}
          description={
            searching
              ? 'Try a different search.'
              : 'Add a service so patients have something to book.'
          }
        />
      ) : (
        <>
          {/* ── What patients can book ──────────────────────────────────── */}
          {publicTotal === 0 ? (
            <EmptyState
              title="No patient-facing service matches"
              description="Nothing patients can book matches this search. The internal list below is filtered by the same box — check there."
            />
          ) : (
            <ResponsiveTable
              cards={groups.map((group) => (
                <div key={group.key}>
                  <DataCardGroupHeading
                    label={group.label}
                    count={group.rows.length}
                  />
                  <div className="space-y-2">
                    {group.rows.map((s) => (
                      <ServiceCard
                        key={s.id}
                        service={s}
                        busy={busyId === s.id}
                        onToggleActive={(isActive) =>
                          toggle.mutate({ id: s.id, isActive })
                        }
                        onDelete={() => setDeleting(s)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead>Provider type</TableHead>
                    <TableHead className="text-right tabular-nums">
                      Estimated fee
                    </TableHead>
                    <TableHead className="text-right tabular-nums">
                      Deposit
                    </TableHead>
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
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">
                              {s.title ?? s.titleEn ?? '—'}
                            </span>
                          </div>
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
                            // `inferred` means no admin ever tagged it — the
                            // role was read off the title. Worth showing,
                            // because it is what words the patient's tracker.
                            <span className="text-muted-foreground">
                              {PROVIDER_LABEL[s.provider_type] ?? s.provider_type}{' '}
                              (inferred)
                            </span>
                          ) : (
                            (PROVIDER_LABEL[s.provider_type] ?? s.provider_type)
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {/* No `?? s.price` fallback: `price` is a legacy
                              mirror the server writes for the patient app's
                              sort, not something this console should present
                              as an admin's answer. */}
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
                                s.default_advance_deposit_source ===
                                'platform_default'
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
            </ResponsiveTable>
          )}

          {/* ── What only the back office can charge for ─────────────────── */}
          <InternalServices
            rows={internal}
            searching={searching}
            busyId={busyId}
            deletingId={remove.isPending ? (deleting?.id ?? null) : null}
            onToggleActive={(id, isActive) => toggle.mutate({ id, isActive })}
            onDelete={setDeleting}
          />
        </>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={
          deleting?.isAdminOnly
            ? 'Remove this internal service?'
            : 'Remove this service?'
        }
        description={
          // Two different warnings, because the two rows fail differently. A
          // storefront row vanishing from the app is the thing an operator is
          // about to be asked about; an internal one has no app to vanish
          // from, and the loss is that nobody can put the charge on an invoice
          // again.
          deleting?.isAdminOnly ? (
            <p>
              It can no longer be added to an invoice. This cannot be undone
              from here.
            </p>
          ) : (
            <p>
              It disappears from the patient app immediately and can no longer be
              booked. This cannot be undone from here.
            </p>
          )
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

/**
 * The back-office catalog, as its own section below the storefront one.
 *
 * ## Why it is a section and not a seventh group
 *
 * It used to be a heading row inside the main table. A heading row inside a
 * list of categories reads as one more category, which is the one thing these
 * rows are not — an operator scanning for what the app offers had to know that
 * one of the seven dividers meant "and now, the opposite". A section with its
 * own title and its own sentence of explanation states it once, structurally,
 * and puts it after everything a patient can see rather than among it.
 *
 * ## Six columns, not seven
 *
 * Provider type is dropped. It is the role the patient's tracker names while
 * someone is on the way, and a biohazard disposal fee has nobody on the way —
 * the column was an em-dash on nearly every row, and an empty column invites
 * somebody to fill it in.
 *
 * ## `Live` means something else here
 *
 * Nothing in this section is ever visible to a patient, so the switch cannot
 * mean "visible in the app". It means the charge is CURRENT. The invoice
 * builder deliberately still lists an inactive service, badged `Inactive`,
 * rather than hiding it — an operator finishing a quote raised last month can
 * add a retired charge on purpose, which is not true of supplies, where the
 * same switch does remove the row from the picker.
 */
function InternalServices({
  rows,
  searching,
  busyId,
  deletingId,
  onToggleActive,
  onDelete,
}: {
  rows: ServiceWire[];
  searching: boolean;
  busyId: string | null;
  /** The row whose delete is mid-flight, or null. Drives the spinner. */
  deletingId: string | null;
  onToggleActive: (id: string, isActive: boolean) => void;
  onDelete: (service: ServiceWire) => void;
}) {
  // A search that matched nothing internal says so; an unsearched empty
  // catalog does too, because "there are no internal services" is a real
  // answer to the question this section exists to answer. Only the heading is
  // ever unconditional.
  return (
    <section aria-labelledby="internal-services" className="space-y-3 pt-2">
      {/*
        The add button belongs to this section, not to the toolbar at the top:
        creating an internal service used to mean opening the storefront form
        and knowing to find a switch near the bottom of it. Inside the `border-t`
        block, so it reads as part of this heading rather than as a second
        page-level action.
      */}
      <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 id="internal-services" className="font-medium">
            Internal services
          </h2>
          <p className="text-muted-foreground text-sm">
            Billable on an invoice, never shown in the patient app — a callout
            surcharge, a disposal fee, an after-hours premium. Patients cannot
            book these; only the back office can add them to a bill.
          </p>
        </div>
        {/* Stacks under the paragraph on a phone; the sentence is too long to
            share a row with a button at that width. */}
        <div className="shrink-0">
          <ServiceFormSheet adminOnly />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={
            searching ? 'No internal service matches' : 'No internal services yet'
          }
          description={
            searching
              ? 'Try a different search.'
              : 'Use “Add internal service” above — a callout surcharge or a disposal fee is the usual first one.'
          }
        />
      ) : (
        <ResponsiveTable
          cards={rows.map((s) => (
            // `ResponsiveTable` already stacks its cards with a gap, so this
            // is the bare list — the storefront section wraps its own only
            // because each category needs a heading above its rows.
            <InternalServiceCard
              key={s.id}
              service={s}
              busy={busyId === s.id}
              onToggleActive={(isActive) => onToggleActive(s.id, isActive)}
              onDelete={() => onDelete(s)}
            />
          ))}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead className="text-right tabular-nums">
                  Estimated base fee
                </TableHead>
                <TableHead className="text-right tabular-nums">
                  Default advance deposit
                </TableHead>
                <TableHead className="w-12" />
                <TableHead className="w-24">Live</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <span className="font-medium">
                      {s.title ?? s.titleEn ?? '—'}
                    </span>
                    {s.description ? (
                      <div className="text-muted-foreground max-w-[420px] truncate text-xs">
                        {s.description}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
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
                      reason="Only an admin can change the back-office catalog."
                    >
                      <Switch
                        checked={Boolean(s.isActive)}
                        disabled={busyId === s.id}
                        onCheckedChange={(v) => onToggleActive(s.id, v)}
                        aria-label="Available to add to an invoice"
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
                        onClick={() => onDelete(s)}
                        aria-label="Delete"
                      >
                        {deletingId === s.id ? (
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
          </Table>
        </ResponsiveTable>
      )}
    </section>
  );
}

/**
 * One internal service as a card, for the `< md` view.
 *
 * The storefront card's Provider field is gone for the same reason its column
 * is, and the two money labels are spelled out in full — "Estimated base fee",
 * not "Estimated fee" — because on a phone this card is the only place the
 * distinction between the fee and the deposit is written down.
 */
function InternalServiceCard({
  service,
  busy,
  onToggleActive,
  onDelete,
}: {
  service: ServiceWire;
  busy: boolean;
  onToggleActive: (isActive: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <DataCard>
      <DataCardHeader
        primary={
          <span className="truncate font-medium">
            {service.title ?? service.titleEn ?? '—'}
          </span>
        }
        secondary={
          <DisabledWhenDenied
            capability="content.write"
            reason="Only an admin can change the back-office catalog."
          >
            <Switch
              checked={Boolean(service.isActive)}
              disabled={busy}
              onCheckedChange={onToggleActive}
              aria-label="Available to add to an invoice"
            />
          </DisabledWhenDenied>
        }
      />

      <DataCardBody>
        {service.description ? (
          <p className="text-muted-foreground text-xs">{service.description}</p>
        ) : null}
        <DataCardField
          label="Estimated base fee"
          value={
            service.defaultBaseFee == null ? (
              <VariableFee />
            ) : (
              <span className="tabular-nums">{money(service.defaultBaseFee)}</span>
            )
          }
        />
        <DataCardField
          label="Default advance deposit"
          value={
            service.defaultAdvanceDeposit == null ? (
              <VariableFee />
            ) : (
              <span
                className={
                  service.default_advance_deposit_source === 'platform_default'
                    ? 'text-muted-foreground tabular-nums'
                    : 'tabular-nums'
                }
              >
                {money(service.defaultAdvanceDeposit)}
              </span>
            )
          }
        />
      </DataCardBody>

      <DataCardActions>
        <ServiceFormSheet service={service} labelled />
        <DisabledWhenDenied
          capability="content.write"
          reason="Only an admin can remove content."
        >
          <Button variant="outline" size="sm" onClick={onDelete}>
            <Trash2 className="text-destructive size-4" />
            Remove
          </Button>
        </DisabledWhenDenied>
      </DataCardActions>
    </DataCard>
  );
}

/**
 * One catalog row as a card, for the `< md` view.
 *
 * The seven columns collapse to three questions an operator actually asks on a
 * phone: what is this service called, what does it cost, and is it live. The
 * two money figures keep their labels — "Estimated fee" and "Deposit" side by
 * side with no header row would otherwise be two unattributed numbers, and
 * confusing them means quoting a patient the wrong advance.
 *
 * The Live switch stays in the header rather than dropping to the footer,
 * because it is this row's STATE, which is what a card header is for — the
 * same slot the bookings list gives its status badge.
 */
function ServiceCard({
  service,
  busy,
  onToggleActive,
  onDelete,
}: {
  service: ServiceWire;
  busy: boolean;
  onToggleActive: (isActive: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <DataCard>
      <DataCardHeader
        primary={
          <span className="truncate font-medium">
            {service.title ?? service.titleEn ?? '—'}
          </span>
        }
        secondary={
          <DisabledWhenDenied
            capability="content.write"
            reason="Only an admin can change what patients see."
          >
            <Switch
              checked={Boolean(service.isActive)}
              disabled={busy}
              onCheckedChange={onToggleActive}
              aria-label="Visible in the patient app"
            />
          </DisabledWhenDenied>
        }
      />

      <DataCardBody>
        {service.description ? (
          <p className="text-muted-foreground text-xs">{service.description}</p>
        ) : null}
        <DataCardField
          label="Provider"
          value={
            !service.provider_type
              ? '—'
              : service.provider_type_source === 'inferred'
                ? `${PROVIDER_LABEL[service.provider_type] ?? service.provider_type} (inferred)`
                : (PROVIDER_LABEL[service.provider_type] ?? service.provider_type)
          }
        />
        <DataCardField
          label="Estimated fee"
          value={
            service.defaultBaseFee == null ? (
              <VariableFee />
            ) : (
              <span className="tabular-nums">{money(service.defaultBaseFee)}</span>
            )
          }
        />
        <DataCardField
          label="Deposit"
          value={
            service.defaultAdvanceDeposit == null ? (
              <VariableFee />
            ) : (
              <span
                className={
                  service.default_advance_deposit_source === 'platform_default'
                    ? 'text-muted-foreground tabular-nums'
                    : 'tabular-nums'
                }
              >
                {money(service.defaultAdvanceDeposit)}
              </span>
            )
          }
        />
      </DataCardBody>

      <DataCardActions>
        <ServiceFormSheet service={service} labelled />
        <DisabledWhenDenied
          capability="content.write"
          reason="Only an admin can remove content."
        >
          <Button variant="outline" size="sm" onClick={onDelete}>
            <Trash2 className="text-destructive size-4" />
            Remove
          </Button>
        </DisabledWhenDenied>
      </DataCardActions>
    </DataCard>
  );
}
