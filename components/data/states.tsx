'use client';

import { Inbox, Info } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

export function EmptyState({
  title = 'Nothing here yet',
  description,
  icon: Icon = Inbox,
}: {
  title?: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
      <Icon className="text-muted-foreground size-8" />
      <p className="font-medium">{title}</p>
      {description && (
        <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
      )}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-9 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Several list endpoints truncate server-side without saying so
 * (500 rows on patients/providers/billing, 200 on payouts). Presenting a
 * capped list as though it were complete is a correctness bug on a billing
 * report, not a cosmetic one — so when we hit the cap, we say so.
 */
export function ResultCapNotice({
  count,
  cap,
  noun,
}: {
  count: number;
  cap: number;
  noun: string;
}) {
  if (count < cap) return null;
  return (
    <Alert>
      <Info className="size-4" />
      <AlertDescription>
        Showing the most recent {cap} {noun}. The server caps this list, so
        older records are not included — narrow the filters to find them.
      </AlertDescription>
    </Alert>
  );
}
