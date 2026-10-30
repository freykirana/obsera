"use client";

import { useEffect, useState } from "react";
import { Pause, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLiveUpdates, POLL_INTERVAL_MS } from "@/lib/live-updates";
import { formatRelative } from "@/lib/format-date";

/** "Updated 12 sec ago" + auto-refresh toggle for the live dashboard feed */
export function LiveIndicator() {
  const live = useLiveUpdates();
  const [now, setNow] = useState(0);

  // Re-render every second so the relative time stays current
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (!live) return null;
  const { autoRefresh, setAutoRefresh, lastUpdatedAt, refreshNow } = live;
  const updatedText = lastUpdatedAt && now ? `Updated ${formatRelative(lastUpdatedAt, now)}` : "Waiting for data…";

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={`h-1.5 w-1.5 rounded-full ${autoRefresh ? "bg-signal" : "bg-muted-foreground"}`}
        aria-hidden
      />
      <span aria-live="off" className="hidden whitespace-nowrap font-mono lg:inline">{updatedText}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={refreshNow}
        aria-label="Refresh now"
        title="Refresh now"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        onClick={() => setAutoRefresh(!autoRefresh)}
        aria-pressed={autoRefresh}
        title={autoRefresh ? `Auto-refresh every ${POLL_INTERVAL_MS / 1000}s is on` : "Auto-refresh is paused"}
      >
        {autoRefresh ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
        <span className="hidden xl:inline">{autoRefresh ? "Auto-refresh on" : "Auto-refresh off"}</span>
        <span className="sr-only xl:hidden">{autoRefresh ? "Pause auto-refresh" : "Resume auto-refresh"}</span>
      </Button>
    </div>
  );
}
