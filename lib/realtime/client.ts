"use client";

/**
 * lib/realtime/client.ts
 *
 * One EventSource per browser tab, shared by every component that listens,
 * so the layout and the page do not each hold their own connection.
 *
 * Delivery guarantees offered to subscribers:
 *   - each logged event is delivered at most once (deduplicated by id);
 *   - `onResync` fires whenever the view may have missed changes — the server
 *     could not replay a gap, or the tab returns after being hidden — so the
 *     subscriber re-reads authoritative data instead of trusting stale state.
 */

import { RealtimeEvent, type RealtimeMessage } from "./events";

export type RealtimeStatus = "connecting" | "live" | "reconnecting" | "offline";

interface Subscriber {
  onMessage?: (message: RealtimeMessage) => void;
  onResync?: () => void;
  onStatus?: (status: RealtimeStatus) => void;
}

const STREAM_URL = "/api/realtime/stream";
const HIDDEN_RESYNC_MS = 15_000;
const SEEN_LIMIT = 500;

const subscribers = new Set<Subscriber>();
const seen: string[] = [];
const seenSet = new Set<string>();

let source: EventSource | null = null;
let status: RealtimeStatus = "connecting";
let hadConnection = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 2_000;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
let hiddenSince: number | null = null;

function setStatus(next: RealtimeStatus) {
  if (status === next) return;
  status = next;
  subscribers.forEach((s) => s.onStatus?.(next));
}

function resyncAll() {
  subscribers.forEach((s) => s.onResync?.());
}

function remember(id: string): boolean {
  if (seenSet.has(id)) return false;
  seenSet.add(id);
  seen.push(id);
  if (seen.length > SEEN_LIMIT) seenSet.delete(seen.shift()!);
  return true;
}

function handleMessage(event: MessageEvent) {
  let message: RealtimeMessage;
  try {
    message = JSON.parse(event.data);
  } catch {
    return;
  }
  if (message.id && !remember(message.id)) return;

  if (message.type === RealtimeEvent.CONNECTED) {
    const wasReconnect = hadConnection;
    hadConnection = true;
    retryDelay = 2_000;
    setStatus("live");
    if (wasReconnect && !message.payload?.replayed) resyncAll();
    return;
  }
  if (message.type === RealtimeEvent.RESYNC) {
    resyncAll();
    return;
  }
  subscribers.forEach((s) => s.onMessage?.(message));
}

function connect() {
  if (source || typeof window === "undefined" || typeof EventSource === "undefined") return;
  setStatus(hadConnection ? "reconnecting" : "connecting");
  const es = new EventSource(STREAM_URL);
  source = es;
  es.onmessage = handleMessage;
  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) {
      // The browser gave up (e.g. 401 while the session token refreshes); retry ourselves.
      source = null;
      setStatus("offline");
      if (!retryTimer && subscribers.size > 0) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          connect();
        }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30_000);
      }
    } else {
      setStatus("reconnecting");
    }
  };
}

function disconnect() {
  source?.close();
  source = null;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  hadConnection = false;
  setStatus("connecting");
}

function onVisibilityChange() {
  if (document.visibilityState === "hidden") {
    hiddenSince = Date.now();
    return;
  }
  const away = hiddenSince ? Date.now() - hiddenSince : 0;
  hiddenSince = null;
  if (!source) connect();
  if (away >= HIDDEN_RESYNC_MS) resyncAll();
}

export function subscribeRealtime(subscriber: Subscriber): () => void {
  subscribers.add(subscriber);
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  if (subscribers.size === 1 && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  connect();
  subscriber.onStatus?.(status);

  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      // Linger briefly so a page navigation does not drop and reopen the stream.
      closeTimer = setTimeout(() => {
        closeTimer = null;
        if (subscribers.size === 0) disconnect();
      }, 5_000);
    }
  };
}
