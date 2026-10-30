/**
 * Date formatting shared by the dashboard (lib/format-date.ts) and the backend (reports, exports).
 * Plain CommonJS on top of Intl with no dependencies, so both runtimes load this same file
 * and print the same strings: formatDateTime -> "11 Oct 2026, 18:24:39".
 */

const DEFAULT_TIMEZONE = "Asia/Jakarta";

// Settings offers WIB / WITA / WIT; none of them observe DST
const TIMEZONES = [
  { iana: "Asia/Jakarta", label: "WIB", offsetHours: 7 },
  { iana: "Asia/Makassar", label: "WITA", offsetHours: 8 },
  { iana: "Asia/Jayapura", label: "WIT", offsetHours: 9 },
];

const EMPTY = "—";

const toDate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? null : date;
};

// One cached Intl formatter per timezone (constructing them is the slow part)
const formatters = new Map();

const partsIn = (date, timeZone) => {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, formatter);
  }
  const parts = {};
  for (const part of formatter.formatToParts(date)) parts[part.type] = part.value;
  return parts;
};

/** "WIB" for Asia/Jakarta; falls back to the IANA name for anything else */
function timezoneLabel(timeZone = DEFAULT_TIMEZONE) {
  const zone = TIMEZONES.find((z) => z.iana === timeZone);
  return zone ? zone.label : timeZone;
}

/** IANA timezone for a Settings label ("WIB" -> "Asia/Jakarta") */
function timezoneFromLabel(label) {
  const zone = TIMEZONES.find((z) => z.label === label);
  return zone ? zone.iana : DEFAULT_TIMEZONE;
}

/** Standard app format: "11 Oct 2026, 18:24:39". Returns "—" for missing/invalid input. */
function formatDateTime(value, timeZone = DEFAULT_TIMEZONE) {
  const date = toDate(value);
  if (!date) return EMPTY;
  const p = partsIn(date, timeZone);
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}:${p.second}`;
}

/** Date only: "11 Oct 2026" */
function formatDate(value, timeZone = DEFAULT_TIMEZONE) {
  const date = toDate(value);
  if (!date) return EMPTY;
  const p = partsIn(date, timeZone);
  return `${p.day} ${p.month} ${p.year}`;
}

/** Time only: "18:24:39" */
function formatTime(value, timeZone = DEFAULT_TIMEZONE) {
  const date = toDate(value);
  if (!date) return EMPTY;
  const p = partsIn(date, timeZone);
  return `${p.hour}:${p.minute}:${p.second}`;
}

/** Calendar day key ("2026-10-11") in the given timezone, for "same day" comparisons */
function dayKey(value, timeZone = DEFAULT_TIMEZONE) {
  const date = toDate(value);
  if (!date) return EMPTY;
  // en-CA prints ISO-style dates
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Human duration: "45 sec", "2 min", "1 h 5 min", "3 days" */
function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return EMPTY;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

module.exports = {
  DEFAULT_TIMEZONE,
  TIMEZONES,
  timezoneLabel,
  timezoneFromLabel,
  formatDateTime,
  formatDate,
  formatTime,
  dayKey,
  formatDuration,
};
