'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useSession } from '@/components/providers/session-provider';
import { ROLE_LABEL } from '@/lib/rbac/permissions';
import { clearToken } from '@/lib/auth/token-store';
import { broadcastSignOut } from '@/lib/auth/refresh';

function roleTone(role: string) {
  if (role === 'super_admin') return 'default' as const;
  if (role === 'admin') return 'secondary' as const;
  return 'outline' as const;
}

export function Topbar() {
  const { user, role } = useSession();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } finally {
      clearToken();
      broadcastSignOut('signed_out');
      window.location.replace('/login');
    }
  }

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />

      <div className="ml-auto flex items-center gap-3">
        <div className="hidden text-right leading-tight sm:block">
          <div className="text-sm font-medium">{user.full_name || user.email}</div>
          <div className="text-muted-foreground text-xs">{user.email}</div>
        </div>
        <Badge variant={roleTone(role)}>{ROLE_LABEL[role] ?? role}</Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          disabled={busy}
          aria-label="Sign out"
        >
          <LogOut className="size-4" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
