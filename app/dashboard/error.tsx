'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * Section-level boundary.
 *
 * Data-fetch failures are handled inline by `<ApiErrorState>` — this catches
 * the rarer render-time crash, and keeps it from taking the sidebar and
 * topbar down with it so the operator can navigate somewhere else.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[dashboard] render error:', error);
  }, [error]);

  return (
    <Alert variant="destructive" className="max-w-2xl">
      <AlertTriangle className="size-4" />
      <AlertTitle>This screen hit an error</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          Nothing was lost — the page failed to render, not to save. Try again,
          or move to another section.
        </p>
        {error.digest && (
          <p className="font-mono text-xs">Reference: {error.digest}</p>
        )}
        <Button size="sm" variant="outline" onClick={reset}>
          <RefreshCw className="size-3.5" />
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}
