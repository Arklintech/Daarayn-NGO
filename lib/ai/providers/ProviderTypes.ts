/**
 * lib/ai/providers/ProviderTypes.ts
 *
 * Shared types, interfaces, and enums for the Enterprise Intelligence Provider Manager (EIPM).
 * All EIPM modules import from here. No circular dependencies.
 */

// ─── Provider Health States ─────────────────────────────────────────────────

export type ProviderState =
  | "HEALTHY"
  | "BUSY"
  | "RATE_LIMITED"
  | "OFFLINE"
  | "RECOVERING";

// ─── Request / Response ─────────────────────────────────────────────────────

export type CompletionMode = "json" | "text";

export interface ProviderRequest {
  systemPrompt: string;
  userPrompt: string;
  mode: CompletionMode;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Internal correlation ID for logging */
  correlationId?: string;
}

export interface NormalizedResponse {
  /** Raw text or parsed JSON string — MCO receives this */
  content: string;
  /** Which key slot served this request, for internal logging only */
  _internalProviderSlot: string;
  /** True latency in ms */
  _latencyMs: number;
  /** Total tokens used, if reported */
  _tokensUsed?: number;
}

// ─── Provider Slot Runtime State ────────────────────────────────────────────

export interface ProviderSlotHealth {
  /** Human-readable label, e.g. "groq-key-1" */
  slotId: string;
  /** Selection priority — lower = preferred */
  priority: number;
  state: ProviderState;
  failureCount: number;
  successCount: number;
  avgLatencyMs: number;
  /** Epoch ms when the cooldown expires and recovery can begin */
  cooldownExpiresAt: number | null;
  lastSuccessAt: string | null;
  lastFailureReason: string | null;
}

// ─── Provider Interface ──────────────────────────────────────────────────────

/**
 * Every concrete provider (Groq key instance, future providers) must implement this.
 * EnterpriseProviderManager depends only on this interface — never on concrete classes.
 */
export interface IProvider {
  readonly slotId: string;
  readonly priority: number;
  generate(req: ProviderRequest): Promise<NormalizedResponse>;
  healthCheck(): Promise<boolean>;
}

// ─── EIPM Event Log ─────────────────────────────────────────────────────────

export type EIPMEventType =
  | "PROVIDER_SELECTED"
  | "PROVIDER_FAILED"
  | "FAILOVER_ACTIVATED"
  | "RECOVERY_STARTED"
  | "RECOVERY_SUCCESSFUL"
  | "RECOVERY_FAILED"
  | "CIRCUIT_OPENED"
  | "CIRCUIT_CLOSED"
  | "REQUEST_COMPLETE"
  | "REQUEST_RETRY";

export interface EIPMEvent {
  type: EIPMEventType;
  slotId: string;
  timestamp: string;
  message: string;
  latencyMs?: number;
  tokensUsed?: number;
  correlationId?: string;
}
