'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ApiErrorState } from '@/components/rbac/api-error-state';
import { EmptyState, ResultCapNotice, TableSkeleton } from '@/components/data/states';
import { ROW_CAPS } from '@/lib/api/unwrap';
import { listProviders } from '@/lib/api/providers';
import { qk } from '@/lib/api/query-keys';
import { money } from '@/lib/format';
import { CredentialReviewDialog } from '@/components/common/credential-review-dialog';
import { CreateProviderDialog } from './create-provider-dialog';
import { VERIFICATION_LABEL, type ProviderWire } from '@/types/wire/provider';

export function ProvidersTable() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [reviewing, setReviewing] = useState<ProviderWire | null>(null);

  const providers = useQuery({ queryKey: qk.providers, queryFn: listProviders });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (providers.data ?? []).filter((p) => {
      if (filter === 'suspended') {
        if (p.status !== 'suspended') return false;
      } else if (filter !== 'all' && p.verification_status !== filter) {
        return false;
      }
      if (!term) return true;
      return (
        p.full_name?.toLowerCase().includes(term) ||
        p.phone?.toLowerCase().includes(term) ||
        p.email?.toLowerCase().includes(term) ||
        p.specialization?.toLowerCase().includes(term)
      );
    });
  }, [providers.data, search, filter]);

  if (providers.isError) {
    return (
      <ApiErrorState error={providers.error} onRetry={() => providers.refetch()} />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search name, phone, email or specialty"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(v) => v && setFilter(v)}
          variant="outline"
        >
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="pending">Pending</ToggleGroupItem>
          <ToggleGroupItem value="verified">Verified</ToggleGroupItem>
          <ToggleGroupItem value="rejected">Rejected</ToggleGroupItem>
          <ToggleGroupItem value="resubmit_requested">Re-upload</ToggleGroupItem>
          <ToggleGroupItem value="suspended">Suspended</ToggleGroupItem>
        </ToggleGroup>
        <CreateProviderDialog />
      </div>

      <ResultCapNotice
        count={providers.data?.length ?? 0}
        cap={ROW_CAPS.providers}
        noun="providers"
      />

      {providers.isLoading ? (
        <TableSkeleton cols={6} />
      ) : !rows.length ? (
        <EmptyState title="No providers match" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Licence</TableHead>
                <TableHead className="text-right">Fee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-56" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.full_name}
                    <div className="text-muted-foreground text-xs">
                      {p.specialization || p.specialty || '—'}
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">{p.role}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {p.bmdc_license || p.nursing_license || '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(p.fee)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge
                        variant={
                          p.verification_status === 'verified'
                            ? 'default'
                            : p.verification_status === 'rejected'
                              ? 'destructive'
                              : 'secondary'
                        }
                      >
                        {VERIFICATION_LABEL[p.verification_status] ??
                          p.verification_status}
                      </Badge>
                      {p.status === 'suspended' && (
                        <Badge variant="destructive">suspended</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {/*
                      One entry point, not a one-click verify in the row.
                      Verification used to be a bare toggle here — a stray
                      click un-verified a live doctor. It is now a decision
                      taken in the credentials sheet, next to the documents it
                      is about and the reason box the provider will be sent.
                    */}
                    <Button
                      size="sm"
                      variant={
                        p.verification_status === 'pending' ? 'default' : 'outline'
                      }
                      onClick={() => setReviewing(p)}
                    >
                      <ShieldCheck className="size-3.5" />
                      {p.verification_status === 'pending'
                        ? 'Review credentials'
                        : 'Credentials'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* The same review the verification queue opens — the roster used to
          open a narrower sheet that showed the certificate and an approve
          button but never the registration number being checked against it. */}
      <CredentialReviewDialog
        provider={reviewing}
        onOpenChange={(open) => !open && setReviewing(null)}
      />
    </div>
  );
}
