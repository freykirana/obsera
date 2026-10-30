"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";
import { useLiveUpdates } from "@/lib/live-updates";

interface WidgetDataOptions {
  // Refetch silently whenever the live feed signals new data (polling or SSE, see lib/live-updates)
  live?: boolean;
}

interface WidgetDataState<T> {
  // Full response envelope (`{ ok, data, ...meta }`)
  response: T | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Fetch one widget's data from the backend. T is the whole `{ ok, data, ... }` envelope.
 * Changing `url` (e.g. a new global time range) shows the loading state again;
 * responses for an outdated URL are ignored.
 */
export function useWidgetData<T>(url: string | null, { live = false }: WidgetDataOptions = {}): WidgetDataState<T> {
  const [state, setState] = useState<{ url: string | null; response: T | null; error: string | null; loadedUrl: string | null }>({
    url,
    response: null,
    error: null,
    loadedUrl: null,
  });
  const [attempt, setAttempt] = useState(0);

  // Only the stable functions are used as effect dependencies
  const liveUpdates = useLiveUpdates();
  const subscribe = live ? liveUpdates?.subscribe : undefined;
  const reportUpdate = liveUpdates?.reportUpdate;

  useEffect(() => {
    if (!url) return;
    let isCurrent = true;

    const load = async () => {
      try {
        const res = await fetchApi(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`Server responded with ${res.status}`);
        const json = await res.json();
        if (!json.ok) throw new Error(json.message || "The server returned an error");
        if (isCurrent) {
          setState({ url, response: json as T, error: null, loadedUrl: url });
          reportUpdate?.();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Keep showing the last good data if a background refresh fails
        if (isCurrent) setState((prev) => ({ ...prev, url, error: prev.loadedUrl === url ? null : message }));
      }
    };

    load();
    const unsubscribe = subscribe ? subscribe(load) : undefined;

    return () => {
      isCurrent = false;
      unsubscribe?.();
    };
  }, [url, attempt, subscribe, reportUpdate]);

  const retry = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
    setAttempt((n) => n + 1);
  }, []);

  const isFresh = state.loadedUrl === url;
  const error = state.url === url ? state.error : null;
  return {
    response: isFresh ? state.response : null,
    isLoading: !!url && !isFresh && !error,
    error,
    retry,
  };
}
