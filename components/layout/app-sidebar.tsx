'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { BrandLogo } from '@/components/layout/brand-logo';
import { NavBadgeSlot } from '@/components/layout/nav-badges';
import { useSession } from '@/components/providers/session-provider';
import { CAPABILITIES } from '@/lib/rbac/capabilities';
import { NAV, type NavItem } from '@/lib/rbac/nav';
import { hasPermission } from '@/lib/rbac/permissions';
import type { SessionUser } from '@/types/wire/auth';

function allowed(user: SessionUser, capability: keyof typeof CAPABILITIES) {
  return hasPermission(user, CAPABILITIES[capability].uiPermission);
}

/**
 * Visible children only. A section whose every child is denied is hidden
 * outright rather than opening onto a wall of 403s.
 */
function visibleChildren(user: SessionUser, item: NavItem) {
  return (item.children ?? []).filter((c) => allowed(user, c.capability));
}

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useSession();

  const items = NAV.filter((item) => {
    if (!allowed(user, item.capability)) return false;
    if (item.children?.length) return visibleChildren(user, item).length > 0;
    return true;
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          {/* The collapsed rail is 48px wide, so only the stethoscope fits
              there; the full lockup takes over once the sidebar expands. */}
          <BrandLogo
            variant="mark"
            className="hidden h-8 shrink-0 group-data-[collapsible=icon]:block"
          />
          <div className="grid flex-1 gap-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
            <BrandLogo priority className="h-6" />
            <span className="text-muted-foreground truncate text-xs">
              Operations console
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const children = visibleChildren(user, item);
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>

                    {item.badge && <NavBadgeSlot badge={item.badge} />}

                    {active && children.length > 1 && (
                      <SidebarMenuSub>
                        {children.map((child) => (
                          <SidebarMenuSubItem key={child.href}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={pathname === child.href}
                            >
                              <Link href={child.href}>{child.label}</Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
