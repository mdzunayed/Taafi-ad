import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PrescriptionWire } from '@/types/wire/misc';

/**
 * Prescription state, as its own badge rather than the shared `<StatusBadge>`.
 *
 * The two vocabularies collide: `approved` on a BOOKING means "confirmed,
 * assigning a provider" (blue, in motion), while `APPROVED` on a prescription
 * means signed off and done (green). `pending` and `rejected` overlap too.
 * Feeding both through one lookup would make each new key a silent
 * cross-domain regression, so this mirrors how providers already do it — a
 * local label map, in the feature that owns the vocabulary.
 */
const APPROVAL: Record<string, { label: string; className: string }> = {
  PENDING: {
    label: 'Awaiting review',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
  REVISION_REQUESTED: {
    label: 'With doctor',
    className: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400',
  },
  APPROVED: {
    label: 'Approved',
    className:
      'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  },
  REJECTED: {
    label: 'Rejected',
    className: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
  },
};

export function RxApprovalBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const tone = APPROVAL[String(status ?? '').toUpperCase()];
  return (
    <Badge variant="outline" className={cn('font-normal', tone?.className, className)}>
      {tone?.label ?? status ?? '—'}
    </Badge>
  );
}

/**
 * What the PATIENT currently sees, which is not the same question this queue
 * answers. An approved script still reads "Balance due" until the visit is paid
 * for — the two gates are independent, and an operator who conflates them will
 * tell a patient their prescription is ready when it is not openable.
 */
export function RxReleaseBadge({ rx }: { rx: PrescriptionWire }) {
  const paid = rx.payment_status === 'PAID';
  return (
    <Badge
      variant="outline"
      className={cn(
        'font-normal',
        paid
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-400',
      )}
    >
      {paid ? 'Balance settled' : 'Balance due'}
    </Badge>
  );
}
