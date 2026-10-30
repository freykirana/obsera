"use client";

import { Suspense, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { KeyRound, LogOut } from "lucide-react";
import { useUser } from "@/app/context/UserContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GlobalTimeRange } from "@/components/layout/GlobalTimeRange";
import { LiveIndicator } from "@/components/layout/LiveIndicator";
import { SensorStatusBadge } from "@/components/layout/SensorStatusBadge";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { MobileNav } from "@/components/layout/Sidebar";
import { ChangePasswordDialog } from "@/components/layout/ChangePasswordDialog";
import { t } from "@/lib/i18n";

// Pages whose widgets follow the global time range
const TIME_RANGE_PAGES = ["/", "/reports"];

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export function Header() {
  const { user, isLoading, logout } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const showTimeRange = TIME_RANGE_PAGES.includes(pathname);
  const displayName = user?.display_name || "Guest";
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <header className="relative z-40 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 md:px-6">

      {/* Left side: mobile menu + global time range (Dashboard & Reports only) */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <MobileNav />
        {showTimeRange && (
          <Suspense fallback={null}>
            <GlobalTimeRange />
          </Suspense>
        )}
      </div>

      {/* Right side: live feed, sensor heartbeat, notifications, theme, profile */}
      <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-3">
        {showTimeRange && <LiveIndicator />}
        <SensorStatusBadge />
        <NotificationBell />
        <ThemeToggle />

        {isLoading ? (
          <div className="flex items-center gap-3 p-1.5" role="status" aria-label="Loading account">
            <div className="h-7 w-7 animate-pulse rounded-md bg-muted" />
            <div className="hidden h-4 w-20 animate-pulse rounded bg-muted sm:block" />
          </div>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2.5 rounded-md p-1 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("header.account", { name: displayName })}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted font-mono text-xs font-semibold text-foreground" aria-hidden>
                  {getInitials(displayName)}
                </span>
                <span className="hidden flex-col items-start lg:flex" aria-hidden>
                  <span className="text-sm font-medium text-foreground">{displayName}</span>
                  {user?.role && <span className="text-xs font-medium leading-none text-muted-foreground">{user.role}</span>}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex flex-col">
                <span className="truncate text-sm font-semibold text-foreground">{displayName}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">{user?.email || "guest@obsera.local"}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {user && (
                <DropdownMenuItem onSelect={() => setIsChangePasswordOpen(true)} className="gap-2">
                  <KeyRound className="h-4 w-4" aria-hidden />
                  {t("header.changePassword")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={handleLogout} className="gap-2 font-medium text-destructive focus:bg-accent focus:text-destructive">
                <LogOut className="h-4 w-4" aria-hidden />
                {t("header.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <ChangePasswordDialog open={isChangePasswordOpen} onOpenChange={setIsChangePasswordOpen} />
    </header>
  );
}
