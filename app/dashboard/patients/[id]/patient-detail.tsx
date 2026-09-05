'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Eye, EyeOff, ShieldAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiErrorState } from '@/components/rbac/api-error-state';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/data/states';
import { PageHeader } from '@/components/layout/page-header';
import { getPatient } from '@/lib/api/patients';
import { qk } from '@/lib/api/query-keys';
import { dateTime, money } from '@/lib/format';

export function PatientDetail({ id }: { id: string }) {
  const [vaultOpen, setVaultOpen] = useState(false);

  const query = useQuery({
    queryKey: qk.patient(id),
    queryFn: () => getPatient(id),
    // PHI: never hold it longer than the visit to this page needs.
    gcTime: 0,
    staleTime: 0,
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return <ApiErrorState error={query.error} onRetry={() => query.refetch()} />;
  }

  const { patient, careRequests } = query.data;
  const vault = patient.medical_vault;
  const hasVault = vault && Object.keys(vault).length > 0;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/dashboard/patients">
          <ArrowLeft className="size-4" />
          All patients
        </Link>
      </Button>

      <PageHeader title={patient.full_name} description={patient.phone} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">Email</dt>
                <dd>{patient.email || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Address</dt>
                <dd>{patient.address || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Status</dt>
                <dd>{patient.status}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Joined</dt>
                <dd>{dateTime(patient.created_at)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4" />
              Medical vault
            </CardTitle>
            <CardDescription>
              Health information this patient entered themselves.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!hasVault ? (
              <p className="text-muted-foreground text-sm">
                This patient has not filled in their medical vault.
              </p>
            ) : !vaultOpen ? (
              <>
                <Alert>
                  <ShieldAlert className="size-4" />
                  <AlertTitle>Hidden by default</AlertTitle>
                  <AlertDescription>
                    This is protected health information. Only open it when you
                    need it for the call you are on.
                  </AlertDescription>
                </Alert>
                <Button variant="outline" onClick={() => setVaultOpen(true)}>
                  <Eye className="size-4" />
                  Reveal medical vault
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setVaultOpen(false)}>
                  <EyeOff className="size-4" />
                  Hide
                </Button>
                <pre className="bg-muted max-h-80 overflow-auto rounded-md p-3 text-xs">
                  {JSON.stringify(vault, null, 2)}
                </pre>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Booking history</CardTitle>
          <CardDescription>
            Up to the 200 most recent care requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!careRequests?.length ? (
            <EmptyState title="No bookings yet" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Fee</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {careRequests.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="max-w-[260px] truncate">
                        {b.care_type}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={b.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(b.final_price ?? b.offered_budget)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {dateTime(b.created_at)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/dashboard/bookings/${b.id}`}>Open</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
