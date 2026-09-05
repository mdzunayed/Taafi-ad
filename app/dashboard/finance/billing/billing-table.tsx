'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { listBilling } from '@/lib/api/finance';
import { ROW_CAPS } from '@/lib/api/unwrap';
import { qk } from '@/lib/api/query-keys';
import { dateTime, money } from '@/lib/format';

export function BillingTable() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [range, setRange] = useState<{ startDate?: string; endDate?: string }>({});

  const billing = useQuery({
    queryKey: qk.billing(range.startDate, range.endDate),
    queryFn: () => listBilling(range),
  });

  const totals = useMemo(() => {
    const rows = billing.data ?? [];
    return rows.reduce(
      (acc, b) => {
        acc.gross += Number(b.final_price ?? 0);
        acc.deposits += Number(b.deposit_amount ?? 0);
        acc.discounts += Number(b.adjusted_discount ?? 0);
        return acc;
      },
      { gross: 0, deposits: 0, discounts: 0 },
    );
  }, [billing.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="from">From</Label>
          <Input
            id="from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">To</Label>
          <Input
            id="to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          onClick={() =>
            setRange({ startDate: from || undefined, endDate: to || undefined })
          }
        >
          Apply
        </Button>
        {(range.startDate || range.endDate) && (
          <Button
            variant="ghost"
            onClick={() => {
              setFrom('');
              setTo('');
              setRange({});
            }}
          >
            Clear
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <CardDescription>Gross billed</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {money(totals.gross)}
            </CardTitle>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <CardDescription>Deposits collected</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {money(totals.deposits)}
            </CardTitle>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <CardDescription>Discounts given</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {money(totals.discounts)}
            </CardTitle>
          </CardContent>
        </Card>
      </div>

      {/* The totals above are computed from the rows the server actually
          returned. When that list is capped they are a partial sum, which is
          why the cap notice sits directly beneath them. */}
      <ResultCapNotice
        count={billing.data?.length ?? 0}
        cap={ROW_CAPS.billing}
        noun="settlements"
      />

      {billing.isError ? (
        <ApiErrorState error={billing.error} onRetry={() => billing.refetch()} />
      ) : billing.isLoading ? (
        <TableSkeleton cols={6} />
      ) : !billing.data?.length ? (
        <EmptyState
          title="No settlements in this range"
          description="Only completed visits appear here."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Service</TableHead>
                <TableHead className="text-right">Fee</TableHead>
                <TableHead className="text-right">Deposit</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {billing.data.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.patient_name}</TableCell>
                  <TableCell className="max-w-[220px] truncate">
                    {b.care_type}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(b.final_price)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(b.deposit_amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(b.adjusted_discount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {dateTime(b.completed_at ?? b.updated_at)}
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
    </div>
  );
}
