'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { LogOut, PanelLeft } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { useSidebar } from '@/components/ui/sidebar';
import { BrandLogo } from '@/components/layout/brand-logo';
import { NotificationBell } from '@/components/layout/notification-bell';
import { useSession } from '@/components/providers/session-provider';
import { NAV } from '@/lib/rbac/nav';
import { ROLE_LABEL } from '@/lib/rbac/permissions';
import { clearToken } from '@/lib/auth/token-store';
import { broadcastSignOut } from '@/lib/auth/refresh';
import { markSessionOver } from '@/lib/auth/session-state';
import { initials } from '@/lib/format';

function roleTone(role: string) {
  if (role === 'super_admin') return 'default' as const;
  if (role === 'admin') return 'secondary' as const;
  return 'outline' as const;
}

/**
 * What to call the signed-in operator.
 *
 * `full_name` when the row has one. Falling back to the EMAIL was the old
 * behaviour and it is a poor identity: `admin@taafi.app` is a mailbox the
 * whole back office shares, so the bar ended up labelling a person with a
 * role address. The email is still rendered directly beneath this in the
 * account menu, where it belongs as a secondary detail.
 *
 * The final fallback is the literal "Admin". Only back-office roles can hold
 * a session in this console — the BFF refuses anything else at
 * `/api/auth/login` — so an unnamed account here IS an administrator, and
 * naming it as one beats showing a blank space or an address.
 */
function displayNameFor(user: { full_name?: string | null }): string {
  return user.full_name?.trim() || 'Admin';
}

/**
 * Which section the operator is standing in, read off the same `NAV` the
 * sidebar renders from so the two can never name a screen differently.
 *
 * LONGEST PREFIX WINS. `/dashboard/bookings/new` matches both "Bookings Ops"
 * and its own child entry, and the child is the more specific answer — sorting
 * by href length and taking the first match is the whole rule.
 *
 * Unmatched routes (a detail page under a section that declares no child for
 * it) fall back to the parent, and failing that to nothing: the header then
 * shows the brand alone, which is better than inventing a label.
 */
function useSectionLabel(): string | null {
  const pathname = usePathname();
  const candidates = NAV.flatMap((item) => [
    { href: item.href, label: item.label },
    ...(item.children ?? []).map((c) => ({ href: c.href, label: c.label })),
  ]).sort((a, b) => b.href.length - a.href.length);

  const match = candidates.find(
    (c) => pathname === c.href || pathname.startsWith(`${c.href}/`),
  );
  return match?.label ?? null;
}

/**
 * The console's top bar.
 *
 * On a desktop it is the thin strip it always was: a rail toggle, the signed-in
 * identity, a way out. On a phone it becomes the ONLY chrome — the sidebar has
 * become a drawer with nothing on screen to open it, and the brand lockup that
 * lived in the sidebar header has gone with it. So this bar carries three
 * things a small screen cannot get anywhere else: the hamburger, the mark, and
 * the name of the section being looked at.
 *
 * The identity block collapses into an avatar menu rather than being hidden.
 * Which account is signed in decides what the buttons on every screen below
 * will do, and "hidden below `sm`" was the old answer to that question.
 */
export function Topbar() {
  const { user, role } = useSession();
  const { toggleSidebar } = useSidebar();
  const displayName = displayNameFor(user);
  const section = useSectionLabel();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } finally {
      // Same ordering as endSession(): latch first, so the dashboard's polls
      // stop here rather than firing once more against the session the logout
      // call just revoked.
      markSessionOver();
      clearToken();
      broadcastSignOut('signed_out');
      window.location.replace('/login');
    }
  }

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-20 flex h-14 shrink-0 items-center gap-1 border-b px-2 backdrop-blur md:gap-2 md:px-4">
      {/*
        Not `<SidebarTrigger>`. That component is sized `icon-sm` (28px), which
        is the one control on a phone that MUST be hittable — it is the only way
        to reach every other screen. This is the same `toggleSidebar` call at a
        thumb-sized target, shrinking to the desktop size at `md`.
      */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleSidebar}
        className="size-9 md:size-8"
        aria-label="Toggle navigation"
      >
        <PanelLeft className="size-4" />
      </Button>

      <Separator orientation="vertical" className="mx-1 hidden h-4 md:block" />

      {/*
        The brand belongs to the sidebar on a desktop, where it is always
        visible in the header of the rail. Below `md` the rail is a closed
        drawer, so the mark comes here — and only the mark, because the full
        lockup plus a section name does not fit a 320px bar.
      */}
      <BrandLogo variant="mark" className="h-7 shrink-0 md:hidden" />

      {/*
        `min-w-0 flex-1` is what makes `truncate` work here. A flex item defaults
        to `min-width: auto`, so a long section name would refuse to shrink and
        would shove the bell and the avatar off a 320px screen instead of
        ellipsing itself.
      */}
      {section && (
        <span className="min-w-0 flex-1 truncate text-sm font-medium md:text-base">
          {section}
        </span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-2">
        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-full md:size-8"
              aria-label="Account menu"
            >
              <Avatar className="size-7 md:size-6">
                <AvatarFallback className="text-xs">
                  {initials(displayName)}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>

          {/* Pinned width for the same reason as the bell's panel: the
              primitive defaults to the trigger's width, which here is a
              32px circle. */}
          <DropdownMenuContent
            align="end"
            className="w-[min(16rem,calc(100vw-1.5rem))]"
          >
            <div className="space-y-1 px-1.5 py-2">
              <p className="truncate text-sm leading-tight font-medium">
                {displayName}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {user.email}
              </p>
              <Badge variant={roleTone(role)} className="mt-1">
                {ROLE_LABEL[role] ?? role}
              </Badge>
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              variant="destructive"
              disabled={busy}
              onSelect={() => void signOut()}
            >
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
