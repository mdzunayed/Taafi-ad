'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';

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
import { ApiErrorState } from '@/components/rbac/api-error-state';
import { EmptyState, ResultCapNotice, TableSkeleton } from '@/components/data/states';
import { StatusPill } from '@/components/common/account-status-pill';
import { CreatePatientDialog } from './create-patient-dialog';
import { listPatients } from '@/lib/api/patients';
import { ROW_CAPS } from '@/lib/api/unwrap';
import { qk } from '@/lib/api/query-keys';
import { dateOnly } from '@/lib/format';

export function PatientsTable() {
  const [search, setSearch] = useState('');
  const patients = useQuery({ queryKey: qk.patients, queryFn: listPatients });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return patients.data ?? [];
    return (patients.data ?? []).filter(
      (p) =>
        p.full_name?.toLowerCase().includes(term) ||
        p.phone?.toLowerCase().includes(term) ||
        p.email?.toLowerCase().includes(term),
    );
  }, [patients.data, search]);

  if (patients.isError) {
    return (
      <ApiErrorState error={patients.error} onRetry={() => patients.refetch()} />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search name, phone or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <CreatePatientDialog />
      </div>

      <ResultCapNotice
        count={patients.data?.length ?? 0}
        cap={ROW_CAPS.patients}
        noun="patients"
      />

      {patients.isLoading ? (
        <TableSkeleton cols={5} />
      ) : !rows.length ? (
        <EmptyState title="No patients match" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.full_name}</TableCell>
                  <TableCell>{p.phone}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.email || '—'}
                  </TableCell>
                  <TableCell>
                    <StatusPill status={p.status} reason={p.status_reason} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {dateOnly(p.created_at)}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/dashboard/patients/${p.id}`}>Open</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
