"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Analyst notes and tags per IP.
 *
 * TODO: replace with backend endpoints so notes are shared between analysts:
 *   GET    /api/logs/ip/:ip/notes  -> { notes: string, tags: string[], updated_by, updated_at }
 *   PUT    /api/logs/ip/:ip/notes  { notes, tags }
 * Until then they are stored in this browser only (localStorage).
 */

export interface AnalystNotes {
  notes: string;
  tags: string[];
  updatedAt: string | null;
}

const EMPTY: AnalystNotes = { notes: "", tags: [], updatedAt: null };
const EMPTY_JSON = JSON.stringify(EMPTY);
const CHANGE_EVENT = "obsera-analyst-notes-change";
const keyFor = (ip: string) => `obsera-analyst-notes:${ip}`;

const subscribe = (onChange: () => void) => {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
};

const readRaw = (ip: string): string => {
  try {
    return localStorage.getItem(keyFor(ip)) ?? EMPTY_JSON;
  } catch {
    return EMPTY_JSON;
  }
};

const parse = (raw: string): AnalystNotes => {
  try {
    const value = JSON.parse(raw);
    return {
      notes: typeof value.notes === "string" ? value.notes : "",
      tags: Array.isArray(value.tags) ? value.tags.filter((t: unknown) => typeof t === "string") : [],
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
    };
  } catch {
    return EMPTY;
  }
};

export function useAnalystNotes(ip: string) {
  // The raw string is the snapshot so React can compare it cheaply between renders
  const raw = useSyncExternalStore(subscribe, () => readRaw(ip), () => EMPTY_JSON);
  const value = useMemo(() => parse(raw), [raw]);

  const save = useCallback(
    (next: Omit<AnalystNotes, "updatedAt">): boolean => {
      try {
        localStorage.setItem(keyFor(ip), JSON.stringify({ ...next, updatedAt: new Date().toISOString() }));
        window.dispatchEvent(new Event(CHANGE_EVENT));
        return true;
      } catch {
        return false;
      }
    },
    [ip]
  );

  return { ...value, save };
}
