/**
 * lib/realtime/broadcaster.ts
 *
 * Server-side event bus behind /api/realtime/stream.
 *
 * publish() records the event in the shared log (lib/realtime/eventLog.ts)
 * and hands it to this instance's SSE clients immediately. While an instance
 * has SSE clients it polls the log, so events published on any other instance
 * reach them within a few seconds.
 */

import { appendEvent, appendEvents, lastEventRow, readEventsFrom, type LoggedEvent } from "./eventLog";
import { DONATION_DATA_EVENTS, NOTIFICATION_EVENTS, type Audience, type RealtimeMessage } from "./events";

type Listener = (message: RealtimeMessage, audience: string[]) => void;

export interface PublishOptions {
  /** Defaults to all admins. */
  audience?: Audience[];
  /** Transient events (e.g. progress ticks) skip the shared log. */
  durable?: boolean;
}

export interface PublishResult {
  /** "log" when every instance will deliver it; "local" when only this instance could. */
  delivered: "log" | "local";
  id?: string;
}

const POLL_MS = 4_000;
const MAX_POLL_BACKOFF_MS = 30_000;
const REPLAY_LIMIT = 200;

class RealtimeBroadcaster {
  private listeners = new Set<Listener>();
  private readonly instanceId = `inst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  private nextRow: number | null = null;
  private delivered = new Set<number>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pollDelay = POLL_MS;

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.schedulePoll(0);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    };
  }

  /**
   * Call only after the change has been persisted. Resolves once the event is
   * in the shared log (or failed to get there — see `delivered`).
   */
  public async publish(type: string, payload: unknown, options: PublishOptions = {}): Promise<PublishResult> {
    const audience = options.audience?.length ? options.audience : (["admin"] as Audience[]);
    const at = new Date().toISOString();

    if (options.durable === false) {
      this.fanOut({ type, payload, at }, audience);
      return { delivered: "local" };
    }

    try {
      const row = await appendEvent(type, payload, audience, this.instanceId, at);
      this.delivered.add(row);
      this.fanOut({ id: String(row), type, payload, at }, audience);
      return { delivered: "log", id: String(row) };
    } catch (err: any) {
      console.error(`[Realtime] Could not record ${type} in the event log; only this instance's clients were told:`, err.message);
      this.fanOut({ type, payload, at }, audience);
      return { delivered: "local" };
    }
  }

  /** Several events from one operation in a single log write (one Sheets request instead of one per event). */
  public async publishBatch(items: { type: string; payload: unknown; audience?: Audience[] }[]): Promise<PublishResult> {
    const at = new Date().toISOString();
    const normalized = items.map((i) => ({ type: i.type, payload: i.payload, audience: (i.audience?.length ? i.audience : ["admin"]) as Audience[] }));
    try {
      const first = await appendEvents(normalized, this.instanceId, at);
      normalized.forEach((e, k) => {
        const row = first + k;
        this.delivered.add(row);
        this.fanOut({ id: String(row), type: e.type, payload: e.payload, at }, e.audience);
      });
      return { delivered: "log", id: String(first) };
    } catch (err: any) {
      console.error(`[Realtime] Could not record ${items.length} events in the event log; only this instance's clients were told:`, err.message);
      normalized.forEach((e) => this.fanOut({ type: e.type, payload: e.payload, at }, e.audience));
      return { delivered: "local" };
    }
  }

  /** Fire-and-forget publish for callers that do not report delivery. */
  public broadcast(type: string, payload: unknown, options?: PublishOptions): void {
    void this.publish(type, payload, options);
  }

  /** Id of the newest logged event, for clients to resume from. */
  public async logEnd(): Promise<number> {
    if (this.nextRow === null) this.nextRow = (await lastEventRow()) + 1;
    return this.nextRow - 1;
  }

  /** Logged events after `lastId`; `complete` is false when more were missed than can be replayed. */
  public async replaySince(lastId: number): Promise<{ events: LoggedEvent[]; complete: boolean }> {
    const { events, nextRow } = await readEventsFrom(lastId + 1, REPLAY_LIMIT);
    return { events, complete: nextRow - (lastId + 1) < REPLAY_LIMIT };
  }

  private fanOut(message: RealtimeMessage, audience: string[]) {
    for (const listener of this.listeners) {
      try {
        listener(message, audience);
      } catch (err) {
        console.error("[Realtime] Listener failed:", err);
      }
    }
  }

  private schedulePoll(delay: number) {
    if (this.timer || this.listeners.size === 0) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.poll();
    }, delay);
  }

  private async poll() {
    try {
      if (this.nextRow === null) {
        // Start at the end: clients load current state themselves on connect.
        this.nextRow = (await lastEventRow()) + 1;
      } else {
        const { events, nextRow } = await readEventsFrom(this.nextRow);
        for (const event of events) {
          const row = Number(event.message.id);
          if (this.delivered.has(row)) continue;
          this.delivered.add(row);
          if (event.origin !== this.instanceId) this.invalidateCaches(event.message.type);
          this.fanOut(event.message, event.audience);
        }
        this.nextRow = nextRow;
        for (const row of this.delivered) if (row < nextRow) this.delivered.delete(row);
      }
      this.pollDelay = POLL_MS;
    } catch (err: any) {
      this.pollDelay = Math.min(this.pollDelay * 2, MAX_POLL_BACKOFF_MS);
      console.warn(`[Realtime] Event log poll failed, retrying in ${this.pollDelay}ms:`, err.message);
    }
    this.schedulePoll(this.pollDelay);
  }

  /** Another instance changed these records, so this instance's cached copies are stale. */
  private invalidateCaches(type: string) {
    if (DONATION_DATA_EVENTS.includes(type)) {
      void import("../repositories").then((repos) => {
        repos.donationRepository.invalidateCache();
        repos.donorRepository.invalidateCache();
        repos.causeRepository.invalidateCache();
      });
    } else if (NOTIFICATION_EVENTS.includes(type)) {
      void import("../repositories").then((repos) => repos.notificationRepository.invalidateCache());
    }
  }
}

// One bus per server process, even if route bundles load this module separately.
const globalForRealtime = globalThis as unknown as { __daaraynRealtime?: RealtimeBroadcaster };
export const realtimeBroadcaster = globalForRealtime.__daaraynRealtime ?? (globalForRealtime.__daaraynRealtime = new RealtimeBroadcaster());
