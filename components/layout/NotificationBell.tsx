"use client";

import { useState, useSyncExternalStore } from "react";
import { Bell, KeyRound, TrendingUp, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTimezone } from "@/app/context/TimezoneContext";
import { formatDateTime, formatRelative } from "@/lib/format-date";
import { sampleNotifications, type AppNotification, type NotificationType } from "@/lib/notifications";
import { cn } from "@/lib/utils";

// Plain icons; color only marks the signal level (no tinted circles)
const TYPE_STYLES: Record<NotificationType, { icon: typeof Bell; className: string }> = {
  login_success: { icon: KeyRound, className: "text-status-critical" },
  attack_spike: { icon: TrendingUp, className: "text-status-warning" },
  new_ip: { icon: UserPlus, className: "text-muted-foreground" },
};

// Unread items of these types turn the bell badge critical; otherwise it is a signal
const CRITICAL_TYPES: NotificationType[] = ["login_success"];

// Read state is kept per browser until the backend endpoint exists (see lib/notifications.ts)
const READ_KEY = "obsera-notifications-read";
const READ_EVENT = "obsera-notifications-read-change";

const subscribeRead = (onChange: () => void) => {
  window.addEventListener(READ_EVENT, onChange);
  return () => window.removeEventListener(READ_EVENT, onChange);
};
const readRaw = () => {
  try {
    return localStorage.getItem(READ_KEY) ?? "[]";
  } catch {
    return "[]";
  }
};

const parseIds = (raw: string): string[] => {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
};

export function NotificationBell() {
  const { timeZone } = useTimezone();
  // Sample data is anchored to the first render time
  const [now] = useState(() => Date.now());
  const [notifications] = useState<AppNotification[]>(() => sampleNotifications(now));
  const readRawValue = useSyncExternalStore(subscribeRead, readRaw, () => "[]");
  const readIds = new Set<string>(parseIds(readRawValue));
  const unread = notifications.filter((n) => !readIds.has(n.id));
  const hasCriticalUnread = unread.some((n) => CRITICAL_TYPES.includes(n.type));

  const markAllRead = () => {
    try {
      localStorage.setItem(READ_KEY, JSON.stringify(notifications.map((n) => n.id)));
    } catch {
      // Storage unavailable: nothing to persist
    }
    window.dispatchEvent(new Event(READ_EVENT));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label={unread.length ? `Notifications, ${unread.length} unread` : "Notifications"}
        >
          <Bell className="h-5 w-5" aria-hidden />
          {unread.length > 0 && (
            <span
              className={cn(
                "absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-sm px-1 font-mono text-xs font-semibold leading-none",
                hasCriticalUnread ? "bg-status-critical text-background" : "bg-signal text-signal-foreground"
              )}
            >
              {unread.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Notifications</span>
          <span className="rounded border border-border px-1.5 py-0.5 text-xs font-normal text-muted-foreground">Sample data</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.map((notification) => {
          const { icon: Icon, className } = TYPE_STYLES[notification.type];
          const isUnread = !readIds.has(notification.id);
          return (
            <DropdownMenuItem key={notification.id} className="items-start gap-3 py-2">
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", className)} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm", isUnread ? "font-semibold text-foreground" : "text-foreground")}>
                  {notification.title}
                  {isUnread && <span className="sr-only"> (unread)</span>}
                </span>
                <span className="block text-xs text-muted-foreground">{notification.body}</span>
                <span className="block font-mono text-xs text-muted-foreground" title={formatDateTime(notification.at, timeZone)}>
                  {formatRelative(notification.at, now)}
                </span>
              </span>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <span className="text-xs text-muted-foreground">Live alerts are not connected yet.</span>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead} disabled={unread.length === 0}>
            Mark all read
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
