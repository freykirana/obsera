"use client";

import { Suspense, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronsLeft, ChevronsRight, FileBarChart, LayoutDashboard, Menu, ScrollText, Settings } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { t } from "@/lib/i18n";
import { timeRangeSearch } from "@/lib/time-range";
import { cn } from "@/lib/utils";

// keepTimeRange: carry the global ?range=... between pages that share it
const navItems = [
  { name: t("nav.dashboard"), href: "/", icon: LayoutDashboard, keepTimeRange: true },
  { name: t("nav.attackLogs"), href: "/attack-logs", icon: ScrollText, keepTimeRange: false },
  { name: t("nav.reports"), href: "/reports", icon: FileBarChart, keepTimeRange: true },
  { name: t("nav.settings"), href: "/settings", icon: Settings, keepTimeRange: false },
];

type NavLinkProps = React.ComponentProps<typeof Link> & { href: string };

function TimeRangeLink({ href, ...props }: NavLinkProps) {
  const searchParams = useSearchParams();
  return <Link href={`${href}${timeRangeSearch(searchParams)}`} {...props} />;
}

// useSearchParams needs a Suspense boundary; fall back to the plain link while it resolves
function RangeAwareLink(props: NavLinkProps) {
  return (
    <Suspense fallback={<Link {...props} />}>
      <TimeRangeLink {...props} />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Collapsed preference (desktop), stored per browser
// ---------------------------------------------------------------------------

const COLLAPSED_KEY = "obsera-sidebar-collapsed";
const COLLAPSED_EVENT = "obsera-sidebar-collapsed-change";

const subscribeCollapsed = (onChange: () => void) => {
  window.addEventListener(COLLAPSED_EVENT, onChange);
  return () => window.removeEventListener(COLLAPSED_EVENT, onChange);
};
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
};
const writeCollapsed = (collapsed: boolean) => {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // Storage unavailable: the toggle still applies until reload
  }
  window.dispatchEvent(new Event(COLLAPSED_EVENT));
};

// ---------------------------------------------------------------------------
// Shared navigation list
// ---------------------------------------------------------------------------

/**
 * @param labels "always" = full labels (mobile drawer), "responsive" = icon rail below lg,
 *               "hidden" = icon rail everywhere (collapsed by the user)
 */
function SidebarNav({ labels, onNavigate }: { labels: "always" | "responsive" | "hidden"; onNavigate?: () => void }) {
  const pathname = usePathname();
  const labelClass = labels === "always" ? "" : labels === "responsive" ? "sr-only lg:not-sr-only" : "sr-only";

  return (
    <nav aria-label={t("nav.label")} className="mt-2 flex-1 overflow-y-auto">
      <ul className={cn("space-y-0.5", labels === "always" ? "px-3" : "px-2 lg:px-3")}>
        {navItems.map((item) => {
          const isActive = pathname === item.href || (pathname.startsWith(`${item.href}/`) && item.href !== "/");
          const Icon = item.icon;
          const NavLink = item.keepTimeRange ? RangeAwareLink : Link;
          return (
            <li key={item.href}>
              <NavLink
                href={item.href}
                onClick={onNavigate}
                aria-current={isActive ? "page" : undefined}
                title={labels === "always" ? undefined : item.name}
                className={cn(
                  "relative flex items-center gap-3 rounded-md py-2 text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  labels === "always" ? "px-3" : labels === "responsive" ? "justify-center px-0 lg:justify-start lg:px-3" : "justify-center px-0",
                  // Active item: lifted navy fill, white text, 2px blue bar on the left edge
                  isActive
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-primary before:content-['']"
                    : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className={labelClass}>{item.name}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Brand({ showName }: { showName: "always" | "responsive" | "hidden" }) {
  const nameClass = showName === "always" ? "" : showName === "responsive" ? "hidden lg:inline" : "hidden";
  return (
    <div className={cn("flex h-16 w-full items-center gap-2.5 border-b border-sidebar-border", showName === "always" ? "px-4" : "justify-center px-2 lg:justify-start lg:px-4")}>
      <Logo variant="on-dark" size={28} withWordmark wordmarkClassName={cn("text-sm text-sidebar-accent-foreground", nameClass)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop / tablet sidebar (>= md)
// ---------------------------------------------------------------------------

export function Sidebar() {
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const mode = collapsed ? "hidden" : "responsive";

  return (
    <aside
      className={cn(
        "hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex",
        collapsed ? "w-14" : "w-14 lg:w-56"
      )}
    >
      <Brand showName={mode} />
      <SidebarNav labels={mode} />
      {/* Below lg the sidebar is always an icon rail, so the toggle only matters on wide screens */}
      <div className="hidden border-t border-sidebar-border p-2 lg:block">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => writeCollapsed(!collapsed)}
          aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
          aria-expanded={!collapsed}
          className={cn(
            "w-full gap-2 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-sidebar-ring",
            collapsed ? "justify-center" : "justify-start"
          )}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" aria-hidden /> : <ChevronsLeft className="h-4 w-4" aria-hidden />}
          {!collapsed && <span>{t("nav.collapse")}</span>}
        </Button>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Mobile drawer (< md), opened from the header
// ---------------------------------------------------------------------------

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 md:hidden"
        onClick={() => setOpen(true)}
        aria-label={t("nav.openMenu")}
        aria-expanded={open}
      >
        <Menu className="h-5 w-5" aria-hidden />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="sr-only">{t("nav.label")}</SheetTitle>
          <SheetDescription className="sr-only">{t("app.name")}</SheetDescription>
          <div className="flex h-full flex-col">
            <Brand showName="always" />
            <SidebarNav labels="always" onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
