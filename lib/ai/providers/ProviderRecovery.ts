/**
 * lib/ai/providers/ProviderRecovery.ts
 *
 * Background recovery service.
 * Polls providers in RECOVERING state and restores them to HEALTHY when the
 * health check passes, or extends their cooldown when it fails.
 *
 * This runs as a lightweight background interval and is completely invisible
 * to administrators and MCO.
 */

import type { ProviderHealthRegistry } from "./ProviderHealthRegistry";
import { EIPMLogger } from "./EIPMLogger";

const RECOVERY_POLL_INTERVAL_MS = 60 * 1000; // Check every 60 seconds

export class ProviderRecovery {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly registry: ProviderHealthRegistry) {}

  /**
   * Starts the recovery polling loop.
   * Must be called once during EIPM initialization.
   */
  start(): void {
    if (this.intervalHandle) return; // Already running
    this.intervalHandle = setInterval(() => this.runRecoveryCheck(), RECOVERY_POLL_INTERVAL_MS);
    // Allow Node.js to exit without waiting for this timer
    if (this.intervalHandle && typeof (this.intervalHandle as any).unref === "function") {
      (this.intervalHandle as any).unref();
    }
    EIPMLogger.log({
      type: "RECOVERY_STARTED",
      slotId: "EIPM",
      timestamp: new Date().toISOString(),
      message: `Recovery polling service started (interval: ${RECOVERY_POLL_INTERVAL_MS / 1000}s)`,
    });
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  private async runRecoveryCheck(): Promise<void> {
    const entries = this.registry.getAllByPriority();

    for (const entry of entries) {
      const health = entry.breaker.getHealth();
      if (health.state !== "RECOVERING") continue;

      EIPMLogger.log({
        type: "RECOVERY_STARTED",
        slotId: health.slotId,
        timestamp: new Date().toISOString(),
        message: `Running health probe for slot in RECOVERING state`,
      });

      try {
        const isHealthy = await entry.provider.healthCheck();
        if (isHealthy) {
          entry.breaker.markRecovered();
          EIPMLogger.log({
            type: "RECOVERY_SUCCESSFUL",
            slotId: health.slotId,
            timestamp: new Date().toISOString(),
            message: `Health probe passed — slot restored to HEALTHY`,
          });
        } else {
          entry.breaker.markRecoveryFailed();
        }
      } catch (err: any) {
        entry.breaker.markRecoveryFailed();
        EIPMLogger.log({
          type: "RECOVERY_FAILED",
          slotId: health.slotId,
          timestamp: new Date().toISOString(),
          message: `Health probe threw exception: ${err.message?.substring(0, 100)}`,
        });
      }
    }
  }
}
