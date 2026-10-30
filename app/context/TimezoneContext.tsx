"use client";

import React, { createContext, useContext, useSyncExternalStore } from "react";
import { DEFAULT_TIMEZONE, timezoneFromOffset } from "@/lib/format-date";

interface TimezoneContextType {
  timezoneOffset: number;
  // IANA timezone derived from the offset, used by lib/format-date
  timeZone: string;
  setTimezoneOffset: (offset: number) => void;
}

const DEFAULT_OFFSET = 7; // WIB (UTC+7)
const STORAGE_KEY = "obsera-timezone-offset";
const CHANGE_EVENT = "obsera-timezone-change";

const TimezoneContext = createContext<TimezoneContextType>({
  timezoneOffset: DEFAULT_OFFSET,
  timeZone: DEFAULT_TIMEZONE,
  setTimezoneOffset: () => {},
});

export const useTimezone = () => useContext(TimezoneContext);

// In-memory copy so a selection still applies when localStorage is unavailable
let memoryOffset: number | null = null;

const readStoredOffset = (): number => {
  if (memoryOffset !== null) return memoryOffset;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? parseInt(stored, 10) : NaN;
    return Number.isNaN(parsed) ? DEFAULT_OFFSET : parsed;
  } catch {
    return DEFAULT_OFFSET;
  }
};

const subscribe = (onChange: () => void) => {
  // A change made in another tab arrives via storage and takes precedence over the in-memory copy
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    memoryOffset = null;
    onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
};

export const TimezoneProvider = ({ children }: { children: React.ReactNode }) => {
  // Server render uses the default; the client picks up the stored offset after hydration
  const timezoneOffset = useSyncExternalStore(subscribe, readStoredOffset, () => DEFAULT_OFFSET);

  const handleSetTimezoneOffset = React.useCallback((offset: number) => {
    memoryOffset = offset;
    try {
      localStorage.setItem(STORAGE_KEY, offset.toString());
    } catch {
      // Storage unavailable (private mode): the selection only lasts for this session
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return (
    <TimezoneContext.Provider
      value={{ timezoneOffset, timeZone: timezoneFromOffset(timezoneOffset), setTimezoneOffset: handleSetTimezoneOffset }}
    >
      {children}
    </TimezoneContext.Provider>
  );
};
