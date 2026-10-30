import { formatInTimeZone } from "date-fns-tz";
import * as shared from "@/shared/format-date";

/**
 * Single source of truth for every date shown in the app.
 * All formatting goes through the IANA timezone chosen in Settings (WIB / WITA / WIT).
 * The standard formats come from shared/format-date.js, which the backend reports use too.
 */

export const DEFAULT_TIMEZONE = "Asia/Jakarta";

// Settings stores the timezone as a UTC offset in hours
export const TIMEZONE_BY_OFFSET: Record<number, { iana: string; label: string }> = {
  7: { iana: "Asia/Jakarta", label: "WIB" },
  8: { iana: "Asia/Makassar", label: "WITA" },
  9: { iana: "Asia/Jayapura", label: "WIT" },
};

export const timezoneFromOffset = (offset: number): string =>
  TIMEZONE_BY_OFFSET[offset]?.iana ?? DEFAULT_TIMEZONE;

export const timezoneLabelFromOffset = (offset: number): string =>
  TIMEZONE_BY_OFFSET[offset]?.label ?? "WIB";

// Compact chart axis ticks
export const AXIS_TIME_PATTERN = "HH:mm";
export const AXIS_DATE_PATTERN = "d MMM";

const EMPTY = "—";

type DateInput = string | number | Date | null | undefined;

const toDate = (value: DateInput): Date | null => {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? null : date;
};

/** Format with an explicit pattern in the given timezone. Returns "—" for missing/invalid input. */
export function formatInZone(value: DateInput, timeZone: string, pattern: string): string {
  const date = toDate(value);
  if (!date) return EMPTY;
  return formatInTimeZone(date, timeZone, pattern);
}

/** Standard app format: "26 Oct 2026, 22:35:44" */
export function formatDateTime(value: DateInput, timeZone: string = DEFAULT_TIMEZONE): string {
  return shared.formatDateTime(value, timeZone);
}

/** Date only: "26 Oct 2026" */
export function formatDate(value: DateInput, timeZone: string = DEFAULT_TIMEZONE): string {
  return shared.formatDate(value, timeZone);
}

/** Calendar day key ("2026-10-26") in the given timezone, for "same day" comparisons */
export function dayKey(value: DateInput, timeZone: string = DEFAULT_TIMEZONE): string {
  return shared.dayKey(value, timeZone);
}

/** Human duration: "45 sec", "2 min", "1 h 5 min", "3 days" */
export function formatDuration(ms: number): string {
  return shared.formatDuration(ms);
}

/** Relative to now: "just now", "2 min ago", "3 days ago" (timezone-independent) */
export function formatRelative(value: DateInput, now: number = Date.now()): string {
  const date = toDate(value);
  if (!date) return EMPTY;
  const diff = now - date.getTime();
  if (diff < 0) return "just now";
  if (diff < 60_000) return "just now";
  return `${formatDuration(diff)} ago`;
}
