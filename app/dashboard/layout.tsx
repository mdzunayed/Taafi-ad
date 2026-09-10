import { redirect } from 'next/navigation';

import { AppSidebar } from '@/components/layout/app-sidebar';
import { IncomingRequestAlert } from '@/components/layout/incoming-request-alert';
import { Topbar } from '@/components/layout/topbar';
import { RealtimeProvider } from '@/components/providers/realtime-provider';
import { SessionProvider } from '@/components/providers/session-provider';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { readSession } from '@/lib/auth/session';
import { isBackOfficeRole } from '@/lib/rbac/permissions';

/**
 * The dashboard shell.
 *
 * This is the single most valuable Server Component in the app: it reads the
 * identity straight out of the httpOnly cookie — a cookie read, not a network
 * call — so the sidebar arrives already filtered to the user's role, with no
 * loading skeleton and no flash of a link they cannot open.
 *
 * Everything below it fetches on the client. See lib/api/http.ts for why: an
 * RSC cannot set a cookie during render, so an RSC fetch that meets a 401 has
 * no way to rotate the refresh token and recover.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await readSession();

  // Middleware already gates this path, but it decodes an unverified token.
  // This is the real read of what we minted, so it stays as the backstop.
  if (!session || !isBackOfficeRole(session.user.role)) {
    redirect('/login');
  }

  return (
    <SessionProvider
      user={session.user}
      initialToken={{ token: session.token, expiresAt: session.expiresAt }}
    >
      {/* Inside SessionProvider (the socket authenticates with the session's
          token) and wrapping the whole shell, so a new care request alerts an
          operator regardless of which screen they are on. */}
      <RealtimeProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <Topbar />
            <IncomingRequestAlert />
            {/*
              `overflow-x-clip`, NOT `overflow-x-hidden`.

              Both stop a stray wide child from scrolling the page sideways on a
              phone, but `hidden` makes this element a scroll container, and a
              scroll container becomes the containing block for every
              `position: sticky` descendant. The mobile action bar on the
              booking detail screen would then pin to the bottom of this
              full-height box — i.e. somewhere far below the viewport — instead
              of to the screen. `clip` clips without scrolling, so sticky keeps
              resolving against the viewport.
            */}
            <main className="min-w-0 flex-1 space-y-6 overflow-x-clip p-4 md:p-6">
              {children}
            </main>
          </SidebarInset>
        </SidebarProvider>
      </RealtimeProvider>
    </SessionProvider>
  );
}
