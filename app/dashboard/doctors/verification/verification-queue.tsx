'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BadgeCheck,
  Clock,
  FileWarning,
  Gavel,
  Stethoscope,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ApiErrorState } from '@/components/rbac/api-error-state';
import { EmptyState, TableSkeleton } from '@/components/data/states';
import { listProviders } from '@/lib/api/providers';
import { qk } from '@/lib/api/query-keys';
import { dateTime, relativeTime } from '@/lib/format';
import {
  isAwaitingDecision,
  VERIFICATION_LABEL,
  type ProviderWire,
  type VerificationStatus,
} from '@/types/wire/provider';
import { CredentialReviewDialog } from '@/components/common/credential-review-dialog';

type Filter = 'open' | 'pending' | 'resubmit_requested' | 'verified' | 'rejected';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'open', label: 'Awaiting decision' },
  { value: 'pending', label: 'New' },
  { value: 'resubmit_requested', label: 'Re-upload asked' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
];

const TONE: Record<VerificationStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  verified: 'default',
  rejected: 'destructive',
  resubmit_requested: 'outline',
};

export function VerificationQueue() {
  const [filter, setFilter] = useState<Filter>('open');
  const [reviewing, setReviewing] = useState<ProviderWire | null>(null);

  const query = useQuery({ queryKey: qk.providers, queryFn: listProviders });

  const rows = useMemo(() => {
    const all = query.data ?? [];
    const matches = (p: ProviderWire) => {
      const status = p.verification_status ?? 'pending';
      if (filter === 'open') return isAwaitingDecision(status);
      return status === filter;
    };
    return all.filter(matches).sort((a, b) => {
      // Oldest wait first: the queue is a waiting line, and a provider who
      // applied last week outranks one who applied an hour ago. Rows that have
      // never been decided sort to the top — they have waited longest of all.
      //
      // Undecided rows tie-break on `created_at`, not on name. They used to
      // sort alphabetically, which put a doctor who applied this morning above
      // one who has been waiting a fortnight — and now that each row states
      // how long it has waited, an alphabetical order would visibly contradict
      // the number printed on it. ISO-8601 timestamps compare correctly as
      // strings, so no Date parsing is needed.
      const at = a.verification_decided_at ?? '';
      const bt = b.verification_decided_at ?? '';
      if (!at && !bt) {
        return (a.created_at ?? '').localeCompare(b.created_at ?? '');
      }
      if (!at) return -1;
      if (!bt) return 1;
      return at.localeCompare(bt);
    });
  }, [query.data, filter]);

  if (query.isError) {
    return <ApiErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  if (query.isLoading) return <TableSkeleton rows={4} cols={4} />;

  const openCount = (query.data ?? []).filter((p) =>
    isAwaitingDecision(p.verification_status),
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/*
          Five filters do not fit a 320px bar and must not squeeze the labels
          into ellipses, so below `sm` the group scrolls horizontally inside its
          own strip. This is the one exception to the no-sideways-scrolling
          rule: the strip scrolls, the page does not, and a swipeable filter row
          is a native-feeling control rather than a defect.
        */}
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(v) => v && setFilter(v as Filter)}
          variant="outline"
          size="sm"
          className="max-w-full overflow-x-auto"
        >
          {FILTERS.map((f) => (
            <ToggleGroupItem key={f.value} value={f.value}>
              {f.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-muted-foreground text-sm">
          {openCount === 0
            ? 'Nobody is waiting.'
            : `${openCount} provider${openCount === 1 ? '' : 's'} awaiting a decision.`}
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={
            filter === 'open' ? 'The queue is clear' : 'Nothing in this state'
          }
          description={
            filter === 'open'
              ? 'Every provider who has submitted credentials has had a decision.'
              : 'No provider currently holds this verification status.'
          }
        />
      ) : (
        <div className="grid gap-3">
          {rows.map((p) => (
            <QueueRow key={p.id} provider={p} onReview={() => setReviewing(p)} />
          ))}
        </div>
      )}

      <CredentialReviewDialog
        provider={reviewing}
        onOpenChange={(open) => !open && setReviewing(null)}
      />
    </div>
  );
}

function QueueRow({
  provider,
  onReview,
}: {
  provider: ProviderWire;
  onReview: () => void;
}) {
  const status = provider.verification_status ?? 'pending';
  const isNurse = provider.role === 'nurse';
  const licence = isNurse ? provider.nursing_license : provider.bmdc_license;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{provider.full_name}</span>
            <Badge variant={TONE[status]}>{VERIFICATION_LABEL[status]}</Badge>
            <Badge variant="outline" className="capitalize">
              {provider.role}
            </Badge>
            {provider.status === 'suspended' && (
              <Badge variant="destructive">Suspended</Badge>
            )}
          </div>
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1">
              <Stethoscope className="size-3.5" />
              {provider.specialization || provider.specialty || 'No specialisation given'}
            </span>
            <span className="inline-flex items-center gap-1">
              <BadgeCheck className="size-3.5" />
              {/* The registration number is the thing being verified — if it is
                  blank there is nothing to check against the documents, and the
                  reviewer needs to see that before they open the dialog. */}
              {licence ? (
                <span className="font-mono text-xs">{licence}</span>
              ) : (
                <span className="text-destructive">
                  No {isNurse ? 'nursing council' : 'BMDC'} number on file
                </span>
              )}
            </span>
            {/* How long they have been waiting, which is the queue's whole
                ordering principle and was previously invisible on exactly the
                rows that need it: an undecided applicant has no
                `verification_decided_at`, so a pending row showed no time at
                all. The absolute timestamp rides along as a tooltip — "5d ago"
                is the right default for triage, but a reviewer writing a
                rejection wants the date. */}
            {provider.created_at && (
              <span
                className="inline-flex items-center gap-1"
                title={dateTime(provider.created_at)}
              >
                <Clock className="size-3.5" />
                Submitted {relativeTime(provider.created_at)}
              </span>
            )}
            {provider.verification_decided_at && (
              <span
                className="inline-flex items-center gap-1"
                title={dateTime(provider.verification_decided_at)}
              >
                <Gavel className="size-3.5" />
                Decided {relativeTime(provider.verification_decided_at)}
              </span>
            )}
          </p>
          {status === 'resubmit_requested' && provider.verification_reason && (
            <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
              <FileWarning className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Waiting on the provider — we asked for:{' '}
                <span className="italic">{provider.verification_reason}</span>
              </span>
            </p>
          )}
        </div>
        {/* Full width on a phone, where it is the card's one action and a
            right-aligned button would sit in the corner furthest from a
            thumb. */}
        <Button onClick={onReview} className="w-full sm:w-auto">
          Review credentials
        </Button>
      </CardContent>
    </Card>
  );
}
