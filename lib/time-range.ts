"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTimezone } from "@/app/context/TimezoneContext";
import { formatDateTime } from "@/lib/format-date";

/**
 * Global time range shared by every widget on Dashboard and Reports.
 * The URL is the source of truth: ?range=30d, or ?range=custom&from=<ISO>&to=<ISO>.
 */

export const PRESET_RANGES = [
  { value: "1h", short: "1H", label: "Last 1 hour", title: "Last 1 Hour", ms: 60 * 60 * 1000, bucketMs: 60 * 1000 },
  { value: "24h", short: "24H", label: "Last 24 hours", title: "Last 24 Hours", ms: 24 * 60 * 60 * 1000, bucketMs: 60 * 60 * 1000 },
  { value: "7d", short: "7D", label: "Last 7 days", title: "Last 7 Days", ms: 7 * 24 * 60 * 60 * 1000, bucketMs: 60 * 60 * 1000 },
  { value: "30d", short: "30D", label: "Last 30 days", title: "Last 30 Days", ms: 30 * 24 * 60 * 60 * 1000, bucketMs: 24 * 60 * 60 * 1000 },
] as const;

export type PresetRange = (typeof PRESET_RANGES)[number]["value"];
export const DEFAULT_RANGE: PresetRange = "30d";

// Same cap the backend enforces for custom ranges
export const MAX_CUSTOM_SPAN_MS = 366 * 24 * 60 * 60 * 1000;

export type TimeRange =
  | { kind: "preset"; range: PresetRange }
  | { kind: "custom"; from: string; to: string };

// Query keys owned by the time range (kept when navigating between Dashboard and Reports)
export const TIME_RANGE_PARAMS = ["range", "from", "to"] as const;

export const isPresetRange = (value: string | null | undefined): value is PresetRange =>
  PRESET_RANGES.some((p) => p.value === value);

export const presetInfo = (range: PresetRange) => PRESET_RANGES.find((p) => p.value === range)!;

const isValidCustom = (from: string | null, to: string | null): boolean => {
  if (!from || !to) return false;
  const span = new Date(to).getTime() - new Date(from).getTime();
  return Number.isFinite(span) && span > 0 && span <= MAX_CUSTOM_SPAN_MS;
};

/** Read a time range from URL params; anything invalid falls back to the default preset */
export function parseTimeRange(params: Pick<URLSearchParams, "get">): TimeRange {
  const range = params.get("range");
  if (range === "custom") {
    const from = params.get("from");
    const to = params.get("to");
    if (isValidCustom(from, to)) return { kind: "custom", from: from!, to: to! };
  }
  return { kind: "preset", range: isPresetRange(range) ? range : DEFAULT_RANGE };
}

/** Query string for the backend stats endpoints (range + optional from/to + display timezone) */
export function timeRangeQuery(timeRange: TimeRange, timeZone: string): string {
  const params = new URLSearchParams();
  if (timeRange.kind === "custom") {
    params.set("range", "custom");
    params.set("from", timeRange.from);
    params.set("to", timeRange.to);
  } else {
    params.set("range", timeRange.range);
  }
  params.set("tz", timeZone);
  return params.toString();
}

/** Widget title suffix: "Last 30 Days" or "11 Oct 2026, 00:00:00 – 12 Oct 2026, 00:00:00" */
export function timeRangeTitle(timeRange: TimeRange, timeZone: string): string {
  if (timeRange.kind === "preset") return presetInfo(timeRange.range).title;
  return `${formatDateTime(timeRange.from, timeZone)} – ${formatDateTime(timeRange.to, timeZone)}`;
}

/** Lower-case phrase for sentences: "in the last 30 days" / "in the selected range" */
export function timeRangePhrase(timeRange: TimeRange): string {
  if (timeRange.kind === "custom") return "in the selected range";
  return `in the ${presetInfo(timeRange.range).label.toLowerCase()}`;
}

/** URL search string carrying only the time range keys (for links between Dashboard and Reports) */
export function timeRangeSearch(params: Pick<URLSearchParams, "get">): string {
  const kept = new URLSearchParams();
  for (const key of TIME_RANGE_PARAMS) {
    const value = params.get(key);
    if (value) kept.set(key, value);
  }
  const search = kept.toString();
  return search ? `?${search}` : "";
}

export function useTimeRange() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { timeZone } = useTimezone();

  const rangeParam = searchParams.get("range");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const timeRange = useMemo<TimeRange>(
    () => parseTimeRange({ get: (key: string) => ({ range: rangeParam, from: fromParam, to: toParam })[key] ?? null }),
    [rangeParam, fromParam, toParam]
  );

  const replaceParams = useCallback(
    (update: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      update(params);
      const search = params.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const setPreset = useCallback(
    (range: PresetRange) =>
      replaceParams((params) => {
        params.set("range", range);
        params.delete("from");
        params.delete("to");
      }),
    [replaceParams]
  );

  const setCustom = useCallback(
    (from: Date, to: Date) =>
      replaceParams((params) => {
        params.set("range", "custom");
        params.set("from", from.toISOString());
        params.set("to", to.toISOString());
      }),
    [replaceParams]
  );

  return {
    timeRange,
    timeZone,
    query: timeRangeQuery(timeRange, timeZone),
    title: timeRangeTitle(timeRange, timeZone),
    phrase: timeRangePhrase(timeRange),
    setPreset,
    setCustom,
  };
}
