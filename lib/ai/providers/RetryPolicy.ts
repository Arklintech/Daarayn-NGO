/**
 * lib/ai/providers/RetryPolicy.ts
 *
 * Governs retry attempts across providers.
 *
 * Behavior:
 *  - On failure, the failed provider's CircuitBreaker is notified.
 *  - ProviderSelector is asked to re-select (may pick failover key).
 *  - A maximum of maxAttempts retries are allowed across all slots combined.
 *  - A short delay is applied between attempts to avoid thundering herd.
 */

import type { ProviderRequest, NormalizedResponse } from "./ProviderTypes";
import type { ProviderHealthRegistry } from "./ProviderHealthRegistry";
import { ProviderSelector } from "./ProviderSelector";
import { EIPMLogger } from "./EIPMLogger";

const INTER_ATTEMPT_DELAY_MS = 500;

export class RetryPolicy {
  private readonly selector: ProviderSelector;

  constructor(
    private readonly registry: ProviderHealthRegistry,
    private readonly maxAttempts: number = 3
  ) {
    this.selector = new ProviderSelector(registry);
  }

  async execute(req: ProviderRequest): Promise<NormalizedResponse> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const entry = this.selector.selectBestProvider(req.correlationId);

      try {
        const result = await entry.provider.generate(req);
        entry.breaker.recordSuccess(result._latencyMs, result._tokensUsed);
        return result;
      } catch (err: any) {
        lastError = err;
        const errorBody: string | undefined = err.errorBody;

        EIPMLogger.log({
          type: "REQUEST_RETRY",
          slotId: entry.provider.slotId,
          timestamp: new Date().toISOString(),
          message: `Attempt ${attempt}/${this.maxAttempts} failed: ${err.message?.substring(0, 150)}`,
          correlationId: req.correlationId,
        });

        entry.breaker.recordFailure(err, errorBody);

        const isLastAttempt = attempt === this.maxAttempts;
        if (!isLastAttempt) {
          // Check if a failover provider exists before waiting
          try {
            this.selector.selectBestProvider(req.correlationId);
          } catch {
            // No failover available — bail immediately
            break;
          }
          await this.delay(INTER_ATTEMPT_DELAY_MS);
          EIPMLogger.logFailover(entry.provider.slotId, "next-available", err.message?.substring(0, 80));
        }
      }
    }

    throw lastError ?? new Error("[EIPM] All retry attempts exhausted with no specific error.");
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
