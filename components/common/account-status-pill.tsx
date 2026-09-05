'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ACCOUNT_STATUS_LABEL, type AccountStatus } from '@/types/wire/account';

/**
 * Account status, with the recorded reason attached.
 *
 * Separate from `<StatusBadge>`, which speaks the `care_requests` vocabulary.
 * The two share no values and conflating them would mean one lookup table
 * silently colouring the wrong domain.
 *
 * `inactive` and `suspended` are visually distinct on purpose: the first is
 * the legacy soft-delete and mostly means "never finished signing up", the
 * second is a deliberate operator action someone will be asked to justify.
 */
const CLASS: Record<AccountStatus, string> = {
  active: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  inactive: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  suspended: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
};

export function StatusPill({
  status,
  reason,
  className,
}: {
  status: AccountStatus;
  reason?: string | null;
  className?: string;
}) {
  const badge = (
    <Badge variant="outline" className={cn('font-normal', CLASS[status], className)}>
      {ACCOUNT_STATUS_LABEL[status] ?? status}
    </Badge>
  );

  // The reason is mandatory server-side for any non-active status, so when it
  // is missing the row predates that rule — say so rather than showing an
  // empty tooltip.
  if (status === 'active') return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{badge}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {reason || 'No reason was recorded for this change.'}
      </TooltipContent>
    </Tooltip>
  );
}
