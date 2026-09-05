'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCan } from '@/hooks/use-permission';
import type { CapabilityId } from '@/lib/rbac/capabilities';

/**
 * Gate a button or a row on a capability.
 *
 * Default behaviour is to render nothing. For *actions*, prefer
 * {@link DisabledWhenDenied} instead — a greyed-out button with a tooltip
 * tells support staff the action exists and who to ask, where a vanished
 * button just looks like a bug.
 */
export function Can({
  capability,
  children,
  fallback = null,
}: {
  capability: CapabilityId;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return useCan(capability) ? <>{children}</> : <>{fallback}</>;
}

/**
 * Wraps an action so that, when denied, it renders visibly disabled with an
 * explanatory tooltip rather than disappearing.
 */
export function DisabledWhenDenied({
  capability,
  reason,
  children,
}: {
  capability: CapabilityId;
  reason: string;
  children: React.ReactNode;
}) {
  const allowed = useCan(capability);
  if (allowed) return <>{children}</>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* The wrapper keeps the tooltip reachable: a disabled control does
            not emit pointer events of its own. */}
        <span className="inline-flex cursor-not-allowed opacity-50 [&>*]:pointer-events-none">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}
