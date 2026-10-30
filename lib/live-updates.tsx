"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";

/**
 * Live data feed for dashboard widgets.
 *
 * Widgets subscribe to one "update" signal instead of running their own timers.
 * Today the signal is driven by polling every 30 seconds. To switch to push updates:
 *   TODO: expose GET /api/events (text/event-stream) on the backend, then replace the
 *   polling effect below with `new EventSource(url)` and call `signal.emit()` on each event
 *   (keep polling as the fallback when the stream errors).
 */

export const POLL_INTERVAL_MS = 30_000;
const STORAGE_KEY = "obsera-auto-refresh";
const CHANGE_EVENT = "obsera-auto-refresh-change";

type Listener = () => void;

function createSignal() {
  const listeners = new Set<Listener>();
  return {
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit() {
      listeners.forEach((listener) => listener());
    },
  };
}

interface LiveUpdatesValue {
  autoRefresh: boolean;
  setAutoRefresh: (enabled: boolean) => void;
  transport: "polling" | "sse";
  lastUpdatedAt: number | null;
  // Widgets call this after a successful load
  reportUpdate: () => void;
  // Widgets subscribe to refetch when new data may be available
  subscribe: (listener: Listener) => () => void;
  // Ask every subscribed widget to refetch now
  refreshNow: () => void;
}

const LiveUpdatesContext = createContext<LiveUpdatesValue | null>(null);

// Auto-refresh preference (per browser), read without a hydration mismatch
const subscribePreference = (onChange: () => void) => {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
};
const readPreference = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
};

export function LiveUpdatesProvider({ children }: { children: React.ReactNode }) {
  const [signal] = useState(createSignal);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const autoRefresh = useSyncExternalStore(subscribePreference, readPreference, () => true);

  const setAutoRefresh = useCallback((enabled: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
    } catch {
      // Storage unavailable: the toggle still applies until reload
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  // Polling transport (see TODO above for SSE)
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => signal.emit(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoRefresh, signal]);

  const reportUpdate = useCallback(() => setLastUpdatedAt(Date.now()), []);

  const value = useMemo<LiveUpdatesValue>(
    () => ({
      autoRefresh,
      setAutoRefresh,
      transport: "polling",
      lastUpdatedAt,
      reportUpdate,
      subscribe: signal.subscribe,
      refreshNow: signal.emit,
    }),
    [autoRefresh, setAutoRefresh, lastUpdatedAt, reportUpdate, signal]
  );

  return <LiveUpdatesContext.Provider value={value}>{children}</LiveUpdatesContext.Provider>;
}

/** Live feed controls; null outside the provider (widgets then simply don't auto-refresh) */
export const useLiveUpdates = () => useContext(LiveUpdatesContext);
