'use client';

import { ShieldOff } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useSession } from '@/components/providers/session-provider';
import { DENIAL_FOOTER, denialCopyFor } from '@/lib/rbac/copy';
import { ROLE_LABEL, type Permission } from '@/lib/rbac/permissions';

/**
 * The polite 403.
 *
 * Rendered INSIDE the normal dashboard chrome — sidebar, topbar and page
 * header all stay put. That is the difference between "you can't do this
 * particular thing" and an app that looks broken.
 */
export function AccessDenied({
  permission,
  required = [],
  title = 'Not available on your account',
}: {
  permission?: Permission;
  required?: string[];
  title?: string;
}) {
  const { role } = useSession();

  return (
    <Alert className="max-w-2xl">
      <ShieldOff className="size-4" />
      <AlertTitle className="flex items-center gap-2">
        {title}
        <Badge variant="secondary" className="font-normal">
          {ROLE_LABEL[role] ?? role}
        </Badge>
      </AlertTitle>
      <AlertDescription className="space-y-1">
        <p>{denialCopyFor(permission, required)}</p>
        <p className="text-muted-foreground">{DENIAL_FOOTER}</p>
      </AlertDescription>
    </Alert>
  );
}
