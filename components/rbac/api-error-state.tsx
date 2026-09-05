'use client';

import { AlertCircle, RefreshCw, WifiOff } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AccessDenied } from './access-denied';
import { ApiError, isNetworkError, isPermissionError } from '@/lib/api/errors';
import type { Permission } from '@/lib/rbac/permissions';

/**
 * The backstop for every data-fetching page.
 *
 * The TS permission mirror is a guess; Express is the truth. When the server
 * answers 403 this renders the SAME banner the client-side gate would have,
 * using `err.required[]` to pick specific copy. That is what keeps the portal
 * coherent on the day a grant changes server-side and nobody remembers to
 * update `lib/rbac/permissions.ts`.
 */
export function ApiErrorState({
  error,
  onRetry,
  permission,
}: {
  error: unknown;
  onRetry?: () => void;
  permission?: Permission;
}) {
  if (isPermissionError(error)) {
    const required = error instanceof ApiError ? error.required : [];
    return <AccessDenied permission={permission} required={required} />;
  }

  const message =
    error instanceof Error ? error.message : 'Something went wrong.';
  const offline = isNetworkError(error);

  return (
    <Alert variant="destructive" className="max-w-2xl">
      {offline ? (
        <WifiOff className="size-4" />
      ) : (
        <AlertCircle className="size-4" />
      )}
      <AlertTitle>
        {offline ? 'Cannot reach the API' : 'That did not load'}
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{message}</p>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="size-3.5" />
            Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
