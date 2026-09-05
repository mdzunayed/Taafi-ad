'use client';

import { AccessDenied } from './access-denied';
import { useCan } from '@/hooks/use-permission';
import { CAPABILITIES, type CapabilityId } from '@/lib/rbac/capabilities';

/**
 * Page-level guard. Wrap a page body; when the check fails the user gets the
 * polite banner inside the usual chrome instead of a blank or broken screen.
 *
 * This is the *mirror* check — a client-side guess at what the server will
 * allow. The authoritative answer arrives as a 403 and is rendered by
 * `<ApiErrorState>`, which produces the same banner. Two paths, one outcome.
 */
export function PermissionGate({
  capability,
  children,
}: {
  capability: CapabilityId;
  children: React.ReactNode;
}) {
  const allowed = useCan(capability);
  if (allowed) return <>{children}</>;
  return <AccessDenied permission={CAPABILITIES[capability].uiPermission} />;
}
