/**
 * lib/ai/gate/AIWriteGate.ts
 *
 * MOMIN AI Write Gate — Production Hardening
 *
 * CRITICAL SECURITY CONTROL (Audit Finding #13):
 * Every AI-triggered write to financial/ledger/PII Firestore collections
 * must pass through this gate BEFORE any commit. The AI proposes; this gate validates;
 * only then does the write happen.
 *
 * Collections protected by this gate:
 *  - allocations (financial)
 *  - donations (financial)
 *  - programs (fundraising)
 *  - ledger (public ledger — highest sensitivity)
 *  - beneficiaries (PII)
 *  - donors (PII)
 *  - field_reports (field operations)
 */

export type ProtectedCollection =
  | "allocations"
  | "donations"
  | "programs"
  | "ledger"
  | "beneficiaries"
  | "donors"
  | "field_reports";

const PROTECTED_COLLECTIONS: Set<string> = new Set([
  "allocations",
  "donations",
  "programs",
  "ledger",
  "beneficiaries",
  "donors",
  "field_reports",
]);

export interface GateContext {
  /** The administrator email initiating the action */
  adminEmail: string;
  /** Whether this write originated from an AI-proposed action plan */
  aiProposed: boolean;
  /** The collection being written to */
  collection: string;
  /** The action type (e.g. "allocateDonation", "updateDonor") */
  actionType: string;
}

export interface GateResult {
  approved: boolean;
  reason: string;
  /** Unique gate audit ID for tracing */
  gateId: string;
}

/**
 * Schema validators for each protected collection.
 * Returns true if the payload is structurally valid for this collection.
 */
const SCHEMA_VALIDATORS: Record<string, (payload: unknown) => boolean> = {
  allocations: (p) => {
    const d = p as Record<string, unknown>;
    return (
      typeof d.allocatedAmount === "number" &&
      d.allocatedAmount > 0 &&
      typeof d.donorId === "string" &&
      d.donorId.length > 0 &&
      typeof d.projectId === "string" &&
      d.projectId.length > 0
    );
  },
  donations: (p) => {
    const d = p as Record<string, unknown>;
    return typeof d.amount === "number" || typeof d.allocatedAmount === "number";
  },
  programs: (p) => {
    const d = p as Record<string, unknown>;
    return typeof d.amountCollected === "number" || typeof d.title === "string";
  },
  ledger: (p) => {
    const d = p as Record<string, unknown>;
    return typeof d.amount === "number" && typeof d.donorId === "string";
  },
  beneficiaries: (p) => {
    const d = p as Record<string, unknown>;
    return typeof d.name === "string" && d.name.length > 0;
  },
  donors: (p) => {
    const d = p as Record<string, unknown>;
    return typeof d.email === "string" || typeof d.name === "string";
  },
  field_reports: (p) => {
    const d = p as Record<string, unknown>;
    return typeof d.agentId === "string" && d.agentId.length > 0;
  },
};

/**
 * validateAndGate — the single mandatory checkpoint for every AI-initiated
 * Firestore write to a protected collection.
 *
 * @param context - Who is writing, to where, and why
 * @param payload - The data the AI is proposing to write
 * @returns GateResult — { approved: boolean, reason, gateId }
 *
 * Usage:
 *   const gate = validateAndGate(context, payload);
 *   if (!gate.approved) throw new Error(`AI Write Blocked: ${gate.reason}`);
 *   // Only then: await setDoc(...)
 */
export function validateAndGate(
  context: GateContext,
  payload: unknown
): GateResult {
  const gateId = `GATE-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  // 1. Reject if no admin email (server-side identity check)
  if (!context.adminEmail || context.adminEmail.trim() === "") {
    return {
      approved: false,
      reason: "No authenticated admin identity provided. Write rejected.",
      gateId,
    };
  }

  // 2. If writing to a protected collection, apply schema validation
  if (PROTECTED_COLLECTIONS.has(context.collection)) {
    const validator = SCHEMA_VALIDATORS[context.collection];

    if (!validator) {
      return {
        approved: false,
        reason: `No schema validator defined for protected collection "${context.collection}". Write rejected.`,
        gateId,
      };
    }

    if (!validator(payload)) {
      return {
        approved: false,
        reason: `Payload failed schema validation for collection "${context.collection}" on action "${context.actionType}". AI output must not be committed.`,
        gateId,
      };
    }
  }

  // 3. Reject negative or zero financial amounts
  if (context.collection === "allocations" || context.collection === "donations") {
    const d = payload as Record<string, unknown>;
    const amount =
      (d.allocatedAmount as number) ??
      (d.amount as number) ??
      null;
    if (amount !== null && amount <= 0) {
      return {
        approved: false,
        reason: `Financial write rejected: amount must be > 0, got ${amount}.`,
        gateId,
      };
    }
  }

  // All checks passed
  return {
    approved: true,
    reason: "All validation checks passed.",
    gateId,
  };
}

/**
 * Logs the gate decision for audit trail purposes.
 * Call this regardless of approval status.
 */
export function logGateDecision(
  context: GateContext,
  result: GateResult,
  payload: unknown
): void {
  const entry = {
    gateId: result.gateId,
    timestamp: new Date().toISOString(),
    adminEmail: context.adminEmail,
    collection: context.collection,
    actionType: context.actionType,
    aiProposed: context.aiProposed,
    approved: result.approved,
    reason: result.reason,
    payloadSummary:
      typeof payload === "object" && payload !== null
        ? Object.keys(payload as object).join(", ")
        : String(payload),
  };

  if (!result.approved) {
    console.error("[AIWriteGate] BLOCKED:", entry);
  } else {
    console.info("[AIWriteGate] APPROVED:", entry);
  }
}
