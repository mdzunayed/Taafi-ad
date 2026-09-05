'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  listPendingDepositVerification,
  listPendingPaymentVerification,
  rejectDeposit,
  verifyDeposit,
  verifyPayment,
} from '@/lib/api/bookings';
import { qk } from '@/lib/api/query-keys';
import { normalizeError } from '@/lib/api/errors';
import { dateTime, humanize, money } from '@/lib/format';
import type { BookingWire } from '@/types/wire/booking';

type Decision =
  | { kind: 'verify-deposit'; booking: BookingWire }
  | { kind: 'reject-deposit'; booking: BookingWire }
  | { kind: 'verify-payment'; booking: BookingWire };

function QueueTable({
  rows,
  loading,
  error,
  onRetry,
  onDecide,
  kind,
}: {
  rows: BookingWire[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onDecide: (decision: Decision) => void;
  kind: 'deposit' | 'payment';
}) {
  if (error) return <ApiErrorState error={error} onRetry={onRetry} />;
  if (loading) return <TableSkeleton cols={6} />;
  if (!rows?.length) {
    return (
      <EmptyState
        title="Nothing waiting"
        description="Claims appear here as soon as a patient submits a payment reference."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Patient</TableHead>
            <TableHead>Service</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Rail / reference</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead className="w-52" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((b) => (
            <TableRow key={b.id}>
              <TableCell className="font-medium">
                <Link
                  href={`/dashboard/bookings/${b.id}`}
                  className="hover:underline"
                >
                  {b.patient_name}
                </Link>
                <div className="text-muted-foreground text-xs">
                  {b.patient_phone}
                </div>
              </TableCell>
              <TableCell className="max-w-[200px] truncate">
                {b.care_type}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {money(
                  kind === 'deposit'
                    ? (b.required_deposit ?? b.deposit_quoted_amount)
                    : b.final_price,
                )}
              </TableCell>
              <TableCell>
                <div className="text-sm">{humanize(b.deposit_manual_rail)}</div>
                <div className="text-muted-foreground font-mono text-xs">
                  {b.deposit_manual_reference || '—'}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {dateTime(b.deposit_manual_submitted_at ?? b.updated_at)}
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  {/* Confirming that money arrived is a finance action, so the
                      UI gates it on finance_write even though the API would
                      let a support member through. See lib/rbac/capabilities. */}
                  <DisabledWhenDenied
                    capability="bookings.verifyPayment"
                    reason="Only an admin can confirm a payment."
                  >
                    <Button
                      size="sm"
                      onClick={() =>
                        onDecide({
                          kind:
                            kind === 'deposit'
                              ? 'verify-deposit'
                              : 'verify-payment',
                          booking: b,
                        })
                      }
                    >
                      Verify
                    </Button>
                  </DisabledWhenDenied>
                  {kind === 'deposit' && (
                    <DisabledWhenDenied
                      capability="bookings.verifyPayment"
                      reason="Only an admin can reject a payment claim."
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          onDecide({ kind: 'reject-deposit', booking: b })
                        }
                      >
                        Reject
                      </Button>
                    </DisabledWhenDenied>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function VerificationQueues() {
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  const deposits = useQuery({
    queryKey: qk.pendingDeposit,
    queryFn: listPendingDepositVerification,
  });
  const payments = useQuery({
    queryKey: qk.pendingPayment,
    queryFn: listPendingPaymentVerification,
  });

  const decide = useMutation({
    mutationFn: async () => {
      if (!decision) return;
      const id = decision.booking.id;
      if (decision.kind === 'verify-deposit') {
        return verifyDeposit(id, { reference, note });
      }
      if (decision.kind === 'reject-deposit') {
        return rejectDeposit(id, { reason: note });
      }
      return verifyPayment(id, { reference, note });
    },
    onSuccess: () => {
      toast.success('Recorded.');
      queryClient.invalidateQueries({ queryKey: qk.pendingDeposit });
      queryClient.invalidateQueries({ queryKey: qk.pendingPayment });
      queryClient.invalidateQueries({ queryKey: qk.bookings });
      close();
    },
    onError: (error) => toast.error(normalizeError(error).message),
  });

  function close() {
    setDecision(null);
    setReference('');
    setNote('');
  }

  const rejecting = decision?.kind === 'reject-deposit';

  return (
    <>
      <Tabs defaultValue="deposit">
        <TabsList>
          <TabsTrigger value="deposit">
            Deposits{deposits.data?.length ? ` (${deposits.data.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="payment">
            Final balances{payments.data?.length ? ` (${payments.data.length})` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deposit" className="mt-4">
          <QueueTable
            kind="deposit"
            rows={deposits.data}
            loading={deposits.isLoading}
            error={deposits.isError ? deposits.error : null}
            onRetry={() => deposits.refetch()}
            onDecide={setDecision}
          />
        </TabsContent>

        <TabsContent value="payment" className="mt-4">
          <QueueTable
            kind="payment"
            rows={payments.data}
            loading={payments.isLoading}
            error={payments.isError ? payments.error : null}
            onRetry={() => payments.refetch()}
            onDecide={setDecision}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={decision !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {rejecting ? 'Reject this payment claim' : 'Confirm payment received'}
            </DialogTitle>
            <DialogDescription>
              {rejecting
                ? 'The patient is told the reference could not be matched and is asked to try again.'
                : 'Only confirm once you have seen the credit in the account. This unlocks the visit.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!rejecting && (
              <div className="space-y-2">
                <Label htmlFor="reference">Bank / wallet reference</Label>
                <Input
                  id="reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={decision?.booking.deposit_manual_reference ?? ''}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="note">{rejecting ? 'Reason' : 'Note'}</Label>
              <Textarea
                id="note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              onClick={() => decide.mutate()}
              disabled={decide.isPending || (rejecting && !note.trim())}
              variant={rejecting ? 'destructive' : 'default'}
            >
              {decide.isPending && <Loader2 className="size-4 animate-spin" />}
              {rejecting ? 'Reject claim' : 'Confirm payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
