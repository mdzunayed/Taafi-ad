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
import { EmptyState, TableSkeleton } from '@/components/data/states';
import { getCashInHand, settleProviderCash } from '@/lib/api/finance';
import { qk } from '@/lib/api/query-keys';
import { isConflict, normalizeError } from '@/lib/api/errors';
import { dateTime, money } from '@/lib/format';
import type { CashInHandRowWire } from '@/types/wire/finance';

export function CashClearance() {
  const queryClient = useQueryClient();
  const [settling, setSettling] = useState<CashInHandRowWire | null>(null);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  const cash = useQuery({ queryKey: qk.cashInHand, queryFn: getCashInHand });

  const settle = useMutation({
    mutationFn: () =>
      settleProviderCash({
        providerId: settling!.accountId,
        amountCollected: Number(amount),
        adminNotes: notes.trim() || undefined,
      }),
    onSuccess: (result) => {
      toast.success(`Settled. Receipt ${result.receiptId}.`);
      queryClient.invalidateQueries({ queryKey: qk.cashInHand });
      close();
    },
    onError: (error) => {
      const err = normalizeError(error);
      /**
       * Settlement is a compare-and-swap on the provider's exact balance. If
       * they collect another payment between this page loading and the submit,
       * the server answers 409 with a message written for a human. Surface it
       * as-is and refetch so the operator sees the new balance, rather than
       * flattening it into "something went wrong".
       */
      if (isConflict(err)) {
        toast.warning(err.message, {
          description: 'The balance has been refreshed — check it and try again.',
        });
        queryClient.invalidateQueries({ queryKey: qk.cashInHand });
        return;
      }
      toast.error(err.message);
    },
  });

  function close() {
    setSettling(null);
    setAmount('');
    setNotes('');
  }

  if (cash.isError) {
    return <ApiErrorState error={cash.error} onRetry={() => cash.refetch()} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <CardDescription>Cash in the field</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {money(cash.data?.totalCashInField)}
            </CardTitle>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <CardDescription>Collected today</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {money(cash.data?.collectedToday)}
            </CardTitle>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <CardDescription>Providers holding cash</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {cash.data?.outstandingProvidersCount ?? 0}
            </CardTitle>
          </CardContent>
        </Card>
      </div>

      {cash.isLoading ? (
        <TableSkeleton cols={5} />
      ) : !cash.data?.providers?.length ? (
        <EmptyState title="Nothing outstanding" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Cash in hand</TableHead>
                <TableHead>Last handover</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {cash.data.providers.map((p) => (
                <TableRow key={p.accountId}>
                  <TableCell className="font-medium">
                    {p.name}
                    <div className="text-muted-foreground text-xs">{p.phone}</div>
                  </TableCell>
                  <TableCell className="capitalize">{p.role}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(p.cashInHand)}
                    {p.isPayoutLocked && (
                      <Badge variant="destructive" className="ml-2">
                        payout locked
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {p.lastCollectionAt ? dateTime(p.lastCollectionAt) : 'Never'}
                  </TableCell>
                  <TableCell>
                    <DisabledWhenDenied
                      capability="finance.write"
                      reason="Only an admin can record a cash handover."
                    >
                      <Button
                        size="sm"
                        onClick={() => {
                          setSettling(p);
                          setAmount(String(p.cashInHand));
                        }}
                        disabled={p.cashInHand <= 0}
                      >
                        Settle
                      </Button>
                    </DisabledWhenDenied>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={settling !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record cash handover</DialogTitle>
            <DialogDescription>
              {settling?.name} is holding {money(settling?.cashInHand)}. Enter
              what you actually counted — any shortfall is recorded as a
              discrepancy and the ledger is zeroed either way.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount collected</Label>
              <Input
                id="amount"
                type="number"
                min={0}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Counted at the Gulshan desk…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              onClick={() => settle.mutate()}
              disabled={settle.isPending || amount === '' || Number(amount) < 0}
            >
              {settle.isPending && <Loader2 className="size-4 animate-spin" />}
              Record handover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
