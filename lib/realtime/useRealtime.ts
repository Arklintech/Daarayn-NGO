"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeRealtime, type RealtimeStatus } from "./client";
import type { RealtimeMessage } from "./events";

/** Receives every realtime event (for views that apply payloads directly, e.g. chat). */
export function useRealtimeEvents(onMessage: (message: RealtimeMessage) => void, onResync?: () => void): RealtimeStatus {
  const handlers = useRef({ onMessage, onResync });
  handlers.current = { onMessage, onResync };
  const [status, setStatus] = useState<RealtimeStatus>("connecting");

  useEffect(
    () =>
      subscribeRealtime({
        onMessage: (m) => handlers.current.onMessage(m),
        onResync: () => handlers.current.onResync?.(),
        onStatus: setStatus,
      }),
    []
  );

  return status;
}

interface RefreshOptions {
  /** Coalesces bursts (one mutation often emits several events). */
  debounceMs?: number;
  /** Safety-net refresh while the tab is visible, in case an event is lost. 0 disables. */
  fallbackMs?: number;
  enabled?: boolean;
}

/**
 * Calls `refresh` whenever one of `types` arrives, when the stream says this
 * view may have missed events, and periodically as a fallback.
 */
export function useRealtimeRefresh(
  types: readonly string[],
  refresh: () => void,
  { debounceMs = 400, fallbackMs = 120_000, enabled = true }: RefreshOptions = {}
): RealtimeStatus {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const typesKey = types.join("|");
  const [status, setStatus] = useState<RealtimeStatus>("connecting");

  useEffect(() => {
    if (!enabled) return;
    const wanted = new Set(typesKey.split("|"));
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        refreshRef.current();
      }, debounceMs);
    };

    const unsubscribe = subscribeRealtime({
      onMessage: (m) => {
        if (wanted.has(m.type)) schedule();
      },
      onResync: schedule,
      onStatus: setStatus,
    });

    const fallback =
      fallbackMs > 0
        ? setInterval(() => {
            if (document.visibilityState === "visible") refreshRef.current();
          }, fallbackMs)
        : null;

    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      if (fallback) clearInterval(fallback);
    };
  }, [typesKey, debounceMs, fallbackMs, enabled]);

  return status;
}
