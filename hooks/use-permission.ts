'use client';

import { useSession } from '@/components/providers/session-provider';
import { CAPABILITIES, type CapabilityId } from '@/lib/rbac/capabilities';
import { hasPermission, type Permission } from '@/lib/rbac/permissions';

/** True when the signed-in user holds `permission`. */
export function usePermission(permission: Permission): boolean {
  const { user } = useSession();
  return hasPermission(user, permission);
}

/** True when the signed-in user may perform `capability` in this UI. */
export function useCan(capability: CapabilityId): boolean {
  const { user } = useSession();
  return hasPermission(user, CAPABILITIES[capability].uiPermission);
}

export function usePermissions(
  permissions: readonly Permission[],
  mode: 'all' | 'any' = 'all',
): boolean {
  const { user } = useSession();
  return mode === 'all'
    ? permissions.every((p) => hasPermission(user, p))
    : permissions.some((p) => hasPermission(user, p));
}
