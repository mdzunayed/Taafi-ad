'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSession } from '@/components/providers/session-provider';
import { CAPABILITIES } from '@/lib/rbac/capabilities';
import { NAV } from '@/lib/rbac/nav';
import { hasPermission } from '@/lib/rbac/permissions';

/**
 * The tab bar for a NAV section that has children, reading the same `NAV`
 * declaration `<AppSidebar>` does — which is the point. A section's pages are
 * declared once, so a destination cannot appear in the sidebar and be missing
 * from the tabs, or survive in the tabs after being pulled from the sidebar.
 *
 * Routes, not panels. Each tab is a `<Link>` to a page that already exists, so
 * every deep link keeps working, each page keeps its own `<PermissionGate>`,
 * and nothing is fetched until its tab is opened. The alternative — one route
 * with five `<TabsContent>` blocks — would break those links and mount five
 * tables at once.
 *
 * The Radix root is CONTROLLED off the pathname rather than holding its own
 * selection: navigation is what changes the tab, so letting Radix track a
 * click too would briefly light a tab whose page had not loaded (and would
 * light the wrong one on a back-button press).
 */
export function SectionTabs({ href }: { href: string }) {
  const pathname = usePathname();
  const { user } = useSession();

  const section = NAV.find((item) => item.href === href);
  const children = (section?.children ?? []).filter((child) =>
    hasPermission(user, CAPABILITIES[child.capability].uiPermission),
  );

  // A reader who can reach exactly one page is not choosing between anything.
  if (children.length < 2) return null;

  /*
   * Longest match wins. `/dashboard/content/home-sections` must not light the
   * `/dashboard/content` tab as well, and a nested page under a child route
   * (`/banners/new`) has to keep its parent tab lit rather than none.
   */
  const active = children
    .filter((c) => pathname === c.href || pathname.startsWith(`${c.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <Tabs value={active?.href ?? ''} className="w-full">
      {/* Scrolls rather than wraps: five labels overflow a narrow viewport,
          and a tab bar that reflows to two rows stops reading as one control. */}
      <TabsList variant="line" className="w-full justify-start overflow-x-auto">
        {children.map((child) => (
          <TabsTrigger key={child.href} value={child.href} asChild>
            <Link href={child.href}>{child.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
