/**
 * lib/ai/providers/GroqKeyPool.ts
 *
 * Builds and registers both Groq key slots into the ProviderHealthRegistry.
 *
 * Slot configuration:
 *  - groq-key-1: Priority 1 (primary) — reads GROK_API_KEY
 *  - groq-key-2: Priority 2 (failover) — reads GROK_API_KEY_2
 *
 * Adding a third key in the future requires only adding a new slot here.
 * No other file needs modification.
 */

import { GroqProvider } from "./GroqProvider";
import { ProviderHealthRegistry } from "./ProviderHealthRegistry";

export function buildGroqKeyPool(registry: ProviderHealthRegistry): void {
  const defaultModel = process.env.GROK_MODEL ?? "llama-3.3-70b-versatile";

  const key1 = process.env.GROK_API_KEY;
  const key2 = process.env.GROK_API_KEY_2;

  if (!key1) {
    throw new Error("[EIPM][GroqKeyPool] GROK_API_KEY is not set. Primary Groq provider cannot initialize.");
  }

  registry.register(new GroqProvider("groq-key-1", 1, key1, defaultModel));
  console.log("[EIPM][GroqKeyPool] Registered groq-key-1 (priority=1, PRIMARY)");

  if (key2) {
    registry.register(new GroqProvider("groq-key-2", 2, key2, defaultModel));
    console.log("[EIPM][GroqKeyPool] Registered groq-key-2 (priority=2, FAILOVER)");
  } else {
    console.warn("[EIPM][GroqKeyPool] GROK_API_KEY_2 is not set — failover key not available. " +
      "Set GROK_API_KEY_2 in .env.local to enable automatic failover.");
  }
}
