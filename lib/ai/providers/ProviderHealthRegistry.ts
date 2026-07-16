/**
 * lib/ai/providers/ProviderHealthRegistry.ts
 *
 * Single source of truth for provider runtime health state.
 * Associates each IProvider with its CircuitBreaker.
 * Exposes read-only health snapshots for ProviderSelector and monitoring.
 */

import type { IProvider, ProviderSlotHealth } from "./ProviderTypes";
import { CircuitBreaker } from "./CircuitBreaker";

export interface ProviderEntry {
  provider: IProvider;
  breaker: CircuitBreaker;
}

export class ProviderHealthRegistry {
  private readonly entries: Map<string, ProviderEntry> = new Map();

  register(provider: IProvider): void {
    if (this.entries.has(provider.slotId)) {
      throw new Error(`[ProviderHealthRegistry] Slot "${provider.slotId}" is already registered.`);
    }
    const breaker = new CircuitBreaker(provider.slotId, provider.priority);
    this.entries.set(provider.slotId, { provider, breaker });
  }

  getEntry(slotId: string): ProviderEntry | undefined {
    return this.entries.get(slotId);
  }

  /** Returns all entries ordered by priority (ascending = highest priority first) */
  getAllByPriority(): ProviderEntry[] {
    return Array.from(this.entries.values()).sort(
      (a, b) => a.provider.priority - b.provider.priority
    );
  }

  /** Returns a read-only snapshot of all providers' health */
  getHealthSnapshot(): ProviderSlotHealth[] {
    return this.getAllByPriority().map(e => e.breaker.getHealth());
  }
}
