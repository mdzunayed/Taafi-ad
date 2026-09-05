'use client';

import { useQuery } from '@tanstack/react-query';

import { SidebarMenuBadge } from '@/components/ui/sidebar';
import { listProviders } from '@/lib/api/providers';
import { qk } from '@/lib/api/query-keys';
import type { NavBadge } from '@/lib/rbac/nav';
import { isAwaitingDecision } from '@/types/wire/provider';

/**
 * How many providers are waiting on a credentialing decision.
 *
 * The verification queue was reachable only by opening the Providers section
 * and noticing a second link, so an application could sit for days with
 * nothing anywhere saying so. This is that signal.
 *
 * Shares `qk.providers` with the roster and the queue, so on those pages it is
 * a cache read rather than a second request, and approving from either one
 * invalidates the key and decrements this without extra wiring.
 */
function ProvidersAwaitingDecision() {
  const { data } = useQuery({ queryKey: qk.providers, queryFn: listProviders });

  const waiting = (data ?? []).filter((p) =>
    isAwaitingDecision(p.verification_status),
  ).length;

  // No badge at zero — an empty queue is the normal state, and a persistent
  // "0" trains people to stop reading the number.
  if (!waiting) return null;

  return (
    <SidebarMenuBadge
      className="bg-primary text-primary-foreground"
      aria-label={`${waiting} provider${waiting === 1 ? '' : 's'} awaiting a verification decision`}
    >
      {waiting > 99 ? '99+' : waiting}
    </SidebarMenuBadge>
  );
}

/** Resolves a {@link NavBadge} name to its component. */
export function NavBadgeSlot({ badge }: { badge: NavBadge }) {
  switch (badge) {
    case 'providersAwaitingDecision':
      return <ProvidersAwaitingDecision />;
    default:
      return null;
  }
}
