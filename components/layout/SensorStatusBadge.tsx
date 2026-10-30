"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTimezone } from "@/app/context/TimezoneContext";
import { formatDateTime, formatRelative } from "@/lib/format-date";
import { useWidgetData } from "@/lib/use-widget-data";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/api";

type SensorState = "active" | "degraded" | "offline";

interface SensorStatusResponse {
  data: {
    status: SensorState;
    last_seen_at: string | null;
    // Newest ingested attack log (ingestion time)
    last_event_at: string | null;
    thresholds: { active_within_seconds: number; degraded_within_seconds: number };
    sensors: { sensor_id: string; hostname: string | null; status: SensorState; last_seen_at: string }[];
  };
}

// Status dot carries the signal; the label stays in the text color
const STATE_STYLES: Record<SensorState | "unknown", { label: string; dot: string }> = {
  active: { label: "Monitoring active", dot: "bg-status-ok" },
  degraded: { label: "Monitoring degraded", dot: "bg-status-warning" },
  offline: { label: "Monitoring offline", dot: "bg-status-critical" },
  unknown: { label: "Checking sensors…", dot: "bg-muted-foreground" },
};

/** Header badge driven by sensor heartbeats (GET /api/sensors/status) */
export function SensorStatusBadge() {
  const { timeZone } = useTimezone();
  const { response, error } = useWidgetData<SensorStatusResponse>(apiUrl("/api/sensors/status"), { live: true });
  const status = response?.data;
  const state: SensorState | "unknown" = status ? status.status : error ? "offline" : "unknown";
  const style = STATE_STYLES[state];

  const detail = error
    ? "Could not reach the backend to check sensor status."
    : !status
      ? "Checking sensor heartbeats…"
      : status.last_seen_at
        ? `Last signal ${formatRelative(status.last_seen_at)}.`
        : "No heartbeat or attack log received yet.";
  const sensorCount = status ? `${status.sensors.length} sensor${status.sensors.length === 1 ? "" : "s"} reporting since the backend started` : null;
  const lastEvent = status?.last_event_at
    ? `Last event: ${formatDateTime(status.last_event_at, timeZone)} (${formatRelative(status.last_event_at)})`
    : status
      ? "Last event: none"
      : null;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={[style.label, detail, lastEvent, sensorCount].filter(Boolean).join(". ")}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} aria-hidden />
            <span className="hidden text-xs font-medium xl:inline">{style.label}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-left">
          <p>{detail}</p>
          {lastEvent && <p className="mt-1 font-mono">{lastEvent}</p>}
          {sensorCount && <p>{sensorCount}</p>}
          {status && (
            <p className="mt-1 opacity-80">
              Active: signal within {Math.round(status.thresholds.active_within_seconds / 60)} min · Degraded: within{" "}
              {Math.round(status.thresholds.degraded_within_seconds / 60)} min · otherwise Offline.
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
