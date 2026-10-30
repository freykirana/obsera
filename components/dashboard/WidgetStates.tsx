"use client";

import { useEffect, useState } from "react";
import { fromZonedTime } from "date-fns-tz";
import { AlertTriangle, RotateCcw, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiUrl, fetchApi } from "@/lib/api";
import { formatDate, formatDateTime, formatInZone, formatRelative } from "@/lib/format-date";
import { PRESET_RANGES, type PresetRange, type TimeRange, useTimeRange } from "@/lib/time-range";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** Placeholder with the same footprint as the widget body */
export function WidgetSkeleton({ className, label = t("widgets.loading") }: { className?: string; label?: string }) {
  return (
    <div role="status" aria-label={label} className={cn("flex h-full w-full flex-col gap-3", className)}>
      <Skeleton className="h-4 w-1/3 bg-muted" />
      <Skeleton className="w-full flex-1 bg-muted" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export function WidgetError({ message, onRetry, className }: { message: string; onRetry: () => void; className?: string }) {
  return (
    <div
      role="alert"
      className={cn("flex max-h-[200px] w-full items-start gap-3 rounded-lg border border-border px-4 py-3", className)}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-critical" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium text-foreground">{t("widgets.errorTitle")}</p>
        <p className="font-mono text-xs text-muted-foreground">{message}</p>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry} className="shrink-0 gap-1.5">
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        {t("widgets.retry")}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty (with "last attack" hint and a jump to a range that has data)
// ---------------------------------------------------------------------------

const LAST_ATTACK_TTL_MS = 30_000;
let lastAttackCache: { at: number; promise: Promise<string | null> } | null = null;

// Shared across widgets so a page with several empty widgets makes one request
function fetchLastAttack(): Promise<string | null> {
  if (lastAttackCache && Date.now() - lastAttackCache.at < LAST_ATTACK_TTL_MS) return lastAttackCache.promise;
  const promise = fetchApi(apiUrl("/api/attack-logs/last-attack"), { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((json) => (json?.ok ? (json.data.last_attack_at as string | null) : null))
    .catch(() => null);
  lastAttackCache = { at: Date.now(), promise };
  return promise;
}

function useLastAttack() {
  const [state, setState] = useState<{ loaded: boolean; lastAttackAt: string | null; now: number }>({
    loaded: false,
    lastAttackAt: null,
    now: 0,
  });

  useEffect(() => {
    let isCurrent = true;
    fetchLastAttack().then((lastAttackAt) => {
      if (isCurrent) setState({ loaded: true, lastAttackAt, now: Date.now() });
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  return state;
}

type Suggestion =
  | { kind: "preset"; range: PresetRange; label: string }
  | { kind: "custom"; from: Date; to: Date; label: string };

/**
 * Smallest preset that contains the last attack; otherwise the calendar day of the last attack.
 * Preset windows start at a bucket boundary, so one bucket is kept as a safety margin.
 */
function suggestRange(lastAttackAt: string, now: number, timeZone: string): Suggestion {
  const age = now - new Date(lastAttackAt).getTime();
  const preset = PRESET_RANGES.find((p) => age < p.ms - p.bucketMs);
  if (preset) return { kind: "preset", range: preset.value, label: t("widgets.show", { range: preset.label.toLowerCase() }) };

  const day = formatInZone(lastAttackAt, timeZone, "yyyy-MM-dd");
  const from = fromZonedTime(`${day}T00:00:00`, timeZone);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { kind: "custom", from, to, label: t("widgets.show", { range: formatDate(from, timeZone) }) };
}

const isSameRange = (suggestion: Suggestion, current: TimeRange) =>
  suggestion.kind === "preset"
    ? current.kind === "preset" && current.range === suggestion.range
    : current.kind === "custom" &&
      new Date(current.from).getTime() === suggestion.from.getTime() &&
      new Date(current.to).getTime() === suggestion.to.getTime();

export function WidgetEmpty({ message = "No attacks recorded", className }: { message?: string; className?: string }) {
  const { timeRange, timeZone, phrase, setPreset, setCustom } = useTimeRange();
  const { loaded, lastAttackAt, now } = useLastAttack();

  const suggestion = lastAttackAt ? suggestRange(lastAttackAt, now, timeZone) : null;
  const showJump = suggestion && !isSameRange(suggestion, timeRange);

  return (
    <div className={cn("flex max-h-[200px] w-full items-start gap-3 rounded-lg border border-dashed border-border px-4 py-3", className)}>
      <SearchX className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium text-foreground">
          {t("widgets.emptyIn", { message, range: phrase })}
        </p>
        {loaded && (
          <p className="text-xs text-muted-foreground">
            {lastAttackAt ? (
              <>
                {t("widgets.lastAttack")}{" "}
                <span className="font-mono" title={formatDateTime(lastAttackAt, timeZone)}>{formatRelative(lastAttackAt, now)}</span>
                {" · "}
                <span className="font-mono">{formatDateTime(lastAttackAt, timeZone)}</span>
              </>
            ) : (
              t("widgets.noAttacksYet")
            )}
          </p>
        )}
      </div>
      {showJump && (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() =>
            suggestion.kind === "preset" ? setPreset(suggestion.range) : setCustom(suggestion.from, suggestion.to)
          }
        >
          {suggestion.label}
        </Button>
      )}
    </div>
  );
}
