/**
 * lib/ai/providers/CircuitBreaker.ts
 *
 * Per-provider state machine.
 * Manages the lifecycle: HEALTHY → RATE_LIMITED → RECOVERING → HEALTHY.
 *
 * Principles:
 *  - A provider that returns HTTP 429 with a TPD/TPM limit is immediately RATE_LIMITED.
 *  - The cooldown duration is parsed from the error body when available, otherwise defaults.
 *  - Once the cooldown expires, the provider transitions to RECOVERING and a health check fires.
 *  - The state machine never directly transitions to HEALTHY — that is done by ProviderRecovery.
 */

import type { ProviderState, ProviderSlotHealth } from "./ProviderTypes";
import { EIPMLogger } from "./EIPMLogger";

/** Default cooldown when we cannot parse the wait time from the 429 body (50 minutes for TPD) */
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 50 * 60 * 1000;
/** Cooldown for transient errors (network, 5xx) before retry */
const TRANSIENT_ERROR_COOLDOWN_MS = 30 * 1000;
/** Max consecutive failures before marking a provider OFFLINE */
const MAX_FAILURES_BEFORE_OFFLINE = 5;

export class CircuitBreaker {
  private health: ProviderSlotHealth;

  constructor(slotId: string, priority: number) {
    this.health = {
      slotId,
      priority,
      state: "HEALTHY",
      failureCount: 0,
      successCount: 0,
      avgLatencyMs: 0,
      cooldownExpiresAt: null,
      lastSuccessAt: null,
      lastFailureReason: null,
    };
  }

  getHealth(): ProviderSlotHealth {
    return { ...this.health };
  }

  isAvailable(): boolean {
    const { state, cooldownExpiresAt } = this.health;
    if (state === "HEALTHY") return true;
    if (state === "RATE_LIMITED" || state === "BUSY" || state === "RECOVERING") {
      // Auto-transition to HEALTHY once cooldown expires
      if (cooldownExpiresAt && Date.now() >= cooldownExpiresAt) {
        this.health.cooldownExpiresAt = null;
        this.transitionTo("HEALTHY", "Cooldown expired — restored to healthy");
        return true;
      }
      return state === "RECOVERING";
    }
    return false; // OFFLINE
  }

  recordSuccess(latencyMs: number, tokensUsed?: number): void {
    this.health.failureCount = 0;
    this.health.successCount += 1;
    this.health.lastSuccessAt = new Date().toISOString();
    // Rolling average latency
    this.health.avgLatencyMs = Math.round(
      (this.health.avgLatencyMs * 0.8) + (latencyMs * 0.2)
    );
    if (this.health.state !== "HEALTHY") {
      this.transitionTo("HEALTHY", "Successful response received");
    }
    EIPMLogger.log({
      type: "REQUEST_COMPLETE",
      slotId: this.health.slotId,
      timestamp: new Date().toISOString(),
      message: `Request completed successfully`,
      latencyMs,
      tokensUsed,
    });
  }

  recordFailure(error: Error, errorBody?: string): void {
    this.health.failureCount += 1;
    this.health.lastFailureReason = error.message.substring(0, 200);

    const is429 = error.message.includes("HTTP 429") || error.message.includes("Rate Limit");
    const isQuotaExceeded = errorBody?.toLowerCase().includes("tokens per day") ||
      errorBody?.toLowerCase().includes("quota");

    if (is429 || isQuotaExceeded) {
      let cooldownMs = this.parseCooldownFromError(errorBody);
      if (!cooldownMs) {
        const isDaily = errorBody?.toLowerCase().includes("day") || 
                        errorBody?.toLowerCase().includes("daily") || 
                        errorBody?.toLowerCase().includes("tpd");
        cooldownMs = isDaily ? 60 * 60 * 1000 : 10 * 1000; // 10s default for TPM/RPM, 1h for daily
      }
      this.health.cooldownExpiresAt = Date.now() + cooldownMs;
      this.transitionTo("RATE_LIMITED", `Rate limit hit — cooldown for ${Math.round(cooldownMs / 1000)}s`);
      return;
    }

    if (this.health.failureCount >= MAX_FAILURES_BEFORE_OFFLINE) {
      this.health.cooldownExpiresAt = Date.now() + TRANSIENT_ERROR_COOLDOWN_MS;
      this.transitionTo("OFFLINE", `${MAX_FAILURES_BEFORE_OFFLINE} consecutive failures`);
      return;
    }

    // Transient failure — stays HEALTHY but logged
    EIPMLogger.log({
      type: "PROVIDER_FAILED",
      slotId: this.health.slotId,
      timestamp: new Date().toISOString(),
      message: `Transient failure #${this.health.failureCount}: ${error.message.substring(0, 100)}`,
    });
  }

  /**
   * Called by ProviderRecovery when recovery probe succeeds.
   */
  markRecovered(): void {
    this.health.cooldownExpiresAt = null;
    this.health.failureCount = 0;
    this.transitionTo("HEALTHY", "Recovery probe successful — restored to primary");
  }

  /**
   * Called by ProviderRecovery when recovery probe fails — extend cooldown.
   */
  markRecoveryFailed(additionalCooldownMs = DEFAULT_RATE_LIMIT_COOLDOWN_MS): void {
    this.health.cooldownExpiresAt = Date.now() + additionalCooldownMs;
    this.transitionTo("RATE_LIMITED", "Recovery probe failed — extending cooldown");
    EIPMLogger.log({
      type: "RECOVERY_FAILED",
      slotId: this.health.slotId,
      timestamp: new Date().toISOString(),
      message: `Recovery probe failed — cooldown extended by ${Math.round(additionalCooldownMs / 1000)}s`,
    });
  }

  private transitionTo(next: ProviderState, reason: string): void {
    const prev = this.health.state;
    this.health.state = next;

    const eventType =
      next === "HEALTHY" && prev === "RECOVERING" ? "CIRCUIT_CLOSED" :
      next === "RATE_LIMITED" ? "CIRCUIT_OPENED" :
      next === "RECOVERING" ? "RECOVERY_STARTED" :
      "PROVIDER_FAILED";

    EIPMLogger.log({
      type: eventType,
      slotId: this.health.slotId,
      timestamp: new Date().toISOString(),
      message: `[${prev}] → [${next}]: ${reason}`,
    });
  }

  /**
   * Parses the "Please try again in Xm Ys" instruction from Groq 429 error body.
   * Returns ms or null if unparseable.
   */
  private parseCooldownFromError(errorBody?: string): number | null {
    if (!errorBody) return null;
    // Match "try again in 48m36.864s" or "try again in 47.52s"
    const match = errorBody.match(/try again in (?:(\d+)m)?(\d+(?:\.\d+)?)s/i);
    if (!match) return null;
    const minutes = parseInt(match[1] || "0", 10);
    const seconds = parseFloat(match[2] || "0");
    const totalMs = (minutes * 60 + seconds) * 1000;
    // Add 10s buffer
    return totalMs + 10_000;
  }
}
