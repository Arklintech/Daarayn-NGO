/**
 * lib/ai/providers/EnterpriseProviderManager.ts
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║        ENTERPRISE INTELLIGENCE PROVIDER MANAGER (EIPM)                  ║
 * ║        The sole gateway for all AI language generation in MOMIN.         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * RESPONSIBILITIES:
 *  ✓ Provider selection (priority-based)
 *  ✓ Automatic failover (Groq Key 1 → Groq Key 2)
 *  ✓ Circuit breaking (prevents repeated calls to exhausted keys)
 *  ✓ Retry with failover across slots
 *  ✓ Automatic recovery (Key 1 restored when cooldown expires)
 *  ✓ Response normalization (MCO always gets a consistent structure)
 *  ✓ Internal event logging (never surfaced to administrators)
 *  ✓ Health status reporting (for developer tooling)
 *
 * NOT RESPONSIBLE FOR:
 *  ✗ MCO cognition / reasoning
 *  ✗ Prompt construction
 *  ✗ Business rules
 *  ✗ Firestore operations
 *  ✗ Executive dialogue
 *
 * PUBLIC API (the only surface MCO touches):
 *  - EnterpriseProviderManager.generate(req)   → NormalizedResponse
 *  - EnterpriseProviderManager.getHealthStatus() → ProviderSlotHealth[]
 *
 * Singleton — initialized once per process via module-level construction.
 */

import type { ProviderRequest, NormalizedResponse, ProviderSlotHealth } from "./ProviderTypes";
import { ProviderHealthRegistry } from "./ProviderHealthRegistry";
import { RetryPolicy } from "./RetryPolicy";
import { ProviderRecovery } from "./ProviderRecovery";
import { buildGroqKeyPool } from "./GroqKeyPool";
import { EIPMLogger } from "./EIPMLogger";

class EnterpriseProviderManagerSingleton {
  private readonly registry: ProviderHealthRegistry;
  private readonly retryPolicy: RetryPolicy;
  private readonly recovery: ProviderRecovery;
  private initialized = false;

  constructor() {
    this.registry = new ProviderHealthRegistry();
    this.retryPolicy = new RetryPolicy(this.registry, 3);
    this.recovery = new ProviderRecovery(this.registry);
  }

  private ensureInitialized(): void {
    if (this.initialized) return;
    buildGroqKeyPool(this.registry);
    this.recovery.start();
    this.initialized = true;
    EIPMLogger.log({
      type: "PROVIDER_SELECTED",
      slotId: "EIPM",
      timestamp: new Date().toISOString(),
      message: "Enterprise Provider Manager initialized and ready.",
    });
  }

  /**
   * The primary entry point for ALL AI language generation in MOMIN.
   *
   * @param req - Provider request with prompts, mode (json/text), and options.
   * @returns NormalizedResponse — provider identity is never exposed to the caller.
   */
  async generate(req: ProviderRequest): Promise<NormalizedResponse> {
    this.ensureInitialized();

    const correlationId = req.correlationId ?? `EIPM-${Date.now()}`;
    const enrichedReq: ProviderRequest = { ...req, correlationId };

    try {
      return await this.retryPolicy.execute(enrichedReq);
    } catch (err: any) {
      EIPMLogger.log({
        type: "PROVIDER_FAILED",
        slotId: "ALL",
        timestamp: new Date().toISOString(),
        message: `All providers exhausted: ${err.message?.substring(0, 200)}`,
        correlationId,
      });
      throw new Error(
        `[EIPM] The intelligence layer is temporarily unavailable. ` +
        `All configured providers are rate-limited or offline. ` +
        `Please retry in a few minutes. (cid=${correlationId})`
      );
    }
  }

  /**
   * Returns current health status of all registered providers.
   * For use in health-check API routes only — never surfaced to administrators.
   */
  getHealthStatus(): ProviderSlotHealth[] {
    this.ensureInitialized();
    return this.registry.getHealthSnapshot();
  }
}

// ─── Module-level singleton (one instance per Node.js process) ────────────────
export const EnterpriseProviderManager = new EnterpriseProviderManagerSingleton();
