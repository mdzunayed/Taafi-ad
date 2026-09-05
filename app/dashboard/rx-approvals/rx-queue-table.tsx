'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiErrorState } from '@/components/rbac/api-error-state';
import { EmptyState, TableSkeleton } from '@/components/data/states';
import { listPrescriptionQueue, type RxQueueFilter } from '@/lib/api/system';
import { qk } from '@/lib/api/query-keys';
import { relativeTime } from '@/lib/format';
import type { PrescriptionWire } from '@/types/wire/misc';

import { RxApprovalBadge, RxReleaseBadge } from './rx-status-badge';
import { RxReviewSheet } from './rx-review-sheet';

const DECIDED_TABS: { value: RxQueueFilter; label: string }[] = [
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'revision_requested', label: 'With doctor' },
];

/**
 * The Rx approvals queue.
 *
 * Two modes off one component: the live queue (`mode="queue"`, everything
 * awaiting a decision) and the decided history (`mode="decided"`, tabbed).
 *
 * Fetch-once-and-filter, like every table here except the audit log — the
 * endpoint is unpaginated. It IS polled, unlike the bookings table: a doctor
 * standing in a patient's home submits drafts throughout the day, and a queue
 * that only refreshes on navigation leaves them waiting on a review nobody
 * knows is pending. The socket also invalidates this key on `prescription:paid`.
 */
export function RxQueueTable({ mode }: { mode: 'queue' | 'decided' }) {
  const [tab, setTab] = useState<RxQueueFilter>('approved');
  const [selected, setSelected] = useState<PrescriptionWire | null>(null);

  const filter = mode === 'queue' ? undefined : tab;
  const query = useQuery({
    queryKey: qk.prescriptions(filter ?? 'queue'),
    queryFn: () => listPrescriptionQueue(filter),
    refetchInterval: mode === 'queue' ? 60_000 : false,
  });

  return (
    <div className="space-y-4">
      {mode === 'decided' ? (
        <Tabs value={tab} onValueChange={(v) => setTab(v as RxQueueFilter)}>
          <TabsList>
            {DECIDED_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}

      {query.isError ? (
        <ApiErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <TableSkeleton cols={6} />
      ) : !query.data?.length ? (
        <EmptyState
          title={
            mode === 'queue'
              ? 'Nothing waiting on review'
              : 'Nothing decided in this set yet'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Diagnosis</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Review</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((rx) => (
                <TableRow key={rx.id}>
                  <TableCell className="font-medium">
                    {rx.patient?.name ?? rx.patient_snapshot?.name ?? '—'}
                    <div className="text-muted-foreground text-xs">
                      {rx.patient?.phone}
                    </div>
                  </TableCell>
                  <TableCell>
                    {rx.doctor?.full_name ?? rx.doctor_name ?? '—'}
                    <div className="text-muted-foreground text-xs">
                      {rx.doctor?.specialization}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    <span className="line-clamp-1">{rx.diagnosis || '—'}</span>
                    <span className="text-muted-foreground flex items-center gap-2 text-xs">
                      {rx.items?.length ?? 0} med
                      {(rx.items?.length ?? 0) === 1 ? '' : 's'}
                      {rx.attachments?.length ? (
                        <span className="inline-flex items-center gap-0.5">
                          <Paperclip className="size-3" />
                          {rx.attachments.length}
                        </span>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {relativeTime(rx.issued_at)}
                  </TableCell>
                  <TableCell>
                    <RxApprovalBadge status={rx.admin_approval_status} />
                  </TableCell>
                  <TableCell>
                    <RxReleaseBadge rx={rx} />
                  </TableCell>
                  <TableCell>
                    {/* One button, not inline Approve/Reject. The decision needs
                        the medication list and any scan in front of it, which a
                        table row cannot show. */}
                    <Button size="sm" variant="outline" onClick={() => setSelected(rx)}>
                      {mode === 'queue' ? 'Review' : 'View'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <RxReviewSheet
        rx={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
