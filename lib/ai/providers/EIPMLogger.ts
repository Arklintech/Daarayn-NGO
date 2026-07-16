/**
 * lib/ai/providers/EIPMLogger.ts
 *
 * Internal structured logging for EIPM events.
 * Developer-only — never surfaces provider details to administrators.
 */

import type { EIPMEvent } from "./ProviderTypes";

export class EIPMLogger {
  static log(event: EIPMEvent): void {
    const prefix = `[EIPM][${event.type}][${event.slotId}]`;
    const meta = [
      event.latencyMs !== undefined ? `latency=${event.latencyMs}ms` : null,
      event.tokensUsed !== undefined ? `tokens=${event.tokensUsed}` : null,
      event.correlationId ? `cid=${event.correlationId}` : null,
    ].filter(Boolean).join(" | ");

    console.log(`${prefix} ${event.timestamp} — ${event.message}${meta ? ` | ${meta}` : ""}`);
  }

  static logRequest(correlationId: string, slotId: string, mode: string, promptLens: { sys: number; user: number }): void {
    console.log(`[EIPM][REQUEST] cid=${correlationId} slot=${slotId} mode=${mode} sys=${promptLens.sys} user=${promptLens.user}`);
  }

  static logFailover(from: string, to: string, reason: string): void {
    console.warn(`[EIPM][FAILOVER] ${from} → ${to} | Reason: ${reason}`);
  }
}
