/**
 * lib/ai/providers/ProviderSelector.ts
 *
 * Selects the best available provider for the current request.
 *
 * Selection algorithm:
 *  1. Iterate providers ordered by ascending priority (1 = highest).
 *  2. Skip providers whose CircuitBreaker reports unavailable.
 *  3. Return the first available provider.
 *  4. If all providers are unavailable, throw a structured error.
 *
 * Never hardcodes "use Key 1". Priority is data-driven.
 */

import type { ProviderEntry } from "./ProviderHealthRegistry";
import { ProviderHealthRegistry } from "./ProviderHealthRegistry";
import { EIPMLogger } from "./EIPMLogger";

export class ProviderSelector {
  private static lastSelectedSlotIndex = 0;
  constructor(private readonly registry: ProviderHealthRegistry) {}

  /**
   * Returns the best available ProviderEntry using load-balanced round-robin.
   * Throws EIPMAllProvidersUnavailableError if none are available.
   */
  selectBestProvider(correlationId?: string): ProviderEntry {
    const entries = this.registry.getAllByPriority();
    const available = entries.filter(e => e.breaker.isAvailable());

    if (available.length > 0) {
      const index = ProviderSelector.lastSelectedSlotIndex % available.length;
      ProviderSelector.lastSelectedSlotIndex = (index + 1) % available.length;
      const entry = available[index];

      EIPMLogger.log({
        type: "PROVIDER_SELECTED",
        slotId: entry.provider.slotId,
        timestamp: new Date().toISOString(),
        message: `Selected as best available provider (round-robin index ${index} of ${available.length})`,
        correlationId,
      });
      return entry;
    }

    const healthSummary = this.registry
      .getHealthSnapshot()
      .map(h => `${h.slotId}=${h.state}`)
      .join(", ");

    throw new EIPMAllProvidersUnavailableError(
      `[EIPM] All providers are unavailable. States: ${healthSummary}`
    );
  }
}

export class EIPMAllProvidersUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EIPMAllProvidersUnavailableError";
  }
}
