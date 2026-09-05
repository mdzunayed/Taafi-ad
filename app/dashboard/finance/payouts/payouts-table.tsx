'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
import { MaskedValue } from '@/components/common/masked-value';
import { EmptyState, TableSkeleton } from '@/components/data/states';
import { approvePayout, listPayouts, rejectPayout } from '@/lib/api/finance';
import { qk } from '@/lib/api/query-keys';
import { isConflict, normalizeError } from '@/lib/api/errors';
import { dateTime, money } from '@/lib/format';
import type { PayoutRequestWire } from '@/types/wire/finance';

type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'all';

export function PayoutsTable() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('PENDING');
  const [decision, setDecision] = useState<{
    payout: PayoutRequestWire;
    action: 'approve' | 'reject';
  } | null>(null);
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');

  const payouts = useQuery({
    queryKey: qk.payouts(status),
    queryFn: () => listPayouts(status),
    // Bank account numbers: hold them for this view only.
    gcTime: 0,
  });

  const decide = useMutation({
    mutationFn: () =>
      decision!.action === 'approve'
        ? approvePayout(decision!.payout.id, reference.trim())
        : rejectPayout(decision!.payout.id, reason.trim()),
    onSuccess: () => {
      toast.success(
        decision?.action === 'approve' ? 'Payout approved.' : 'Payout rejected.',
      );
      queryClient.invalidateQueries({ queryKey: ['finance', 'payouts'] });
      close();
    },
    onError: (error) => {
      const err = normalizeError(error);
      // Someone else resolved it first. That is a real outcome, not a bug.
      if (isConflict(err)) {
        toast.warning(err.message, {
          description: 'This request was already resolved by another admin.',
        });
        queryClient.invalidateQueries({ queryKey: ['finance', 'payouts'] });
        close();
        return;
      }
      toast.error(err.message);
    },
  });

  function close() {
    setDecision(null);
    setReference('');
    setReason('');
  }

  if (payouts.isError) {
    return <ApiErrorState error={payouts.error} onRetry={() => payouts.refetch()} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <CardDescription>Pending requests</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {payouts.data?.pendingCount ?? 0}
            </CardTitle>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <CardDescription>Pending value</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {money(payouts.data?.pendingTotal)}
            </CardTitle>
          </CardContent>
        </Card>
      </div>

      <ToggleGroup
        type="single"
        value={status}
        onValueChange={(v) => v && setStatus(v as Status)}
        variant="outline"
      >
        <ToggleGroupItem value="PENDING">Pending</ToggleGroupItem>
        <ToggleGroupItem value="APPROVED">Approved</ToggleGroupItem>
        <ToggleGroupItem value="REJECTED">Rejected</ToggleGroupItem>
        <ToggleGroupItem value="all">All</ToggleGroupItem>
      </ToggleGroup>

      {payouts.isLoading ? (
        <TableSkeleton cols={6} />
      ) : !payouts.data?.items?.length ? (
        <EmptyState title="No payout requests here" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-44" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {payouts.data.items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.providerName ?? '—'}
                    <div className="text-muted-foreground text-xs capitalize">
                      {p.providerRole}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(p.amount)}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {p.bankName ?? p.method ?? '—'}
                    </div>
                    {/* Masked by default — these rows get screen-shared. */}
                    <MaskedValue value={p.accountNumber} label="account number" />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {dateTime(p.requestedAt)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        p.status === 'APPROVED'
                          ? 'default'
                          : p.status === 'REJECTED'
                            ? 'destructive'
                            : 'secondary'
                      }
                    >
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {p.status === 'PENDING' && (
                      <div className="flex gap-2">
                        <DisabledWhenDenied
                          capability="finance.write"
                          reason="Only an admin can approve a payout."
                        >
                          <Button
                            size="sm"
                            onClick={() =>
                              setDecision({ payout: p, action: 'approve' })
                            }
                          >
                            Approve
                          </Button>
                        </DisabledWhenDenied>
                        <DisabledWhenDenied
                          capability="finance.write"
                          reason="Only an admin can reject a payout."
                        >
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setDecision({ payout: p, action: 'reject' })
                            }
                          >
                            Reject
                          </Button>
                        </DisabledWhenDenied>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={decision !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision?.action === 'approve'
                ? 'Confirm this payout was sent'
                : 'Reject this payout request'}
            </DialogTitle>
            <DialogDescription>
              {decision?.action === 'approve'
                ? `Only do this after ${money(decision?.payout.amount)} has actually left the account. Enter the transfer reference for the record.`
                : 'The held amount is returned to the provider’s balance and they are told why.'}
            </DialogDescription>
          </DialogHeader>

          {decision?.action === 'approve' ? (
            <div className="space-y-2">
              <Label htmlFor="ref">Transfer reference</Label>
              <Input
                id="ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Bank or wallet transaction id"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="why">Reason</Label>
              <Textarea
                id="why"
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              variant={decision?.action === 'reject' ? 'destructive' : 'default'}
              onClick={() => decide.mutate()}
              disabled={
                decide.isPending ||
                (decision?.action === 'approve'
                  ? !reference.trim()
                  : !reason.trim())
              }
            >
              {decide.isPending && <Loader2 className="size-4 animate-spin" />}
              {decision?.action === 'approve' ? 'Mark as paid' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
