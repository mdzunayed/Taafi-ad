'use client';

import { Badge } from '@/components/ui/badge';
import { humanize } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The `care_requests.status` vocabulary is long and mostly reads as prose once
 * humanised, so the badge earns its keep by grouping states into four
 * operational tones rather than colouring twenty strings individually.
 */
const TONE: Record<string, string> = {
  // Needs someone to act
  submitted: 'amber',
  pending: 'amber',
  deposit_required: 'amber',
  awaiting_deposit: 'amber',
  deposit_paid_admin_reviewing: 'amber',
  amount_assigned_awaiting_final_payment: 'amber',
  service_completed_awaiting_final_payment: 'amber',
  // In motion
  approved: 'blue',
  assigned: 'blue',
  enroute: 'blue',
  on_the_way: 'blue',
  arrived: 'blue',
  in_service: 'blue',
  nurse_completed: 'blue',
  // Done
  completed: 'green',
  // Over, unhappily
  cancelled: 'red',
  rejected: 'red',
};

/**
 * Statuses whose humanised form is not what an operator should read.
 *
 * `humanize` is the right default for a vocabulary that mostly reads as prose,
 * but a few of these names describe the row's *internal* posture rather than
 * the fact the operator cares about. `deposit_paid_admin_reviewing` is the one
 * that matters: it lands the moment someone confirms the money, and rendering
 * it verbatim tells them "Deposit paid admin reviewing" — the reviewing half is
 * their own next action, not news.
 *
 * The TONE stays amber deliberately. The deposit is settled, but the booking
 * still needs a dispatch, and amber is what "needs someone to act" means here.
 */
const LABEL: Record<string, string> = {
  deposit_paid_admin_reviewing: 'Deposit Paid',
};

const CLASS: Record<string, string> = {
  amber:
    'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  blue: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  green:
    'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  red: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
};

export function StatusBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const key = String(status ?? '').toLowerCase();
  const tone = TONE[key];
  return (
    <Badge
      variant="outline"
      className={cn('font-normal', tone && CLASS[tone], className)}
    >
      {LABEL[key] ?? humanize(status)}
    </Badge>
  );
}
