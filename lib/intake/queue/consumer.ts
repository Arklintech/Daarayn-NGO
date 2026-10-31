/**
 * lib/intake/queue/consumer.ts  (D38, ISOLATED): what a delivered wake-up does.
 *
 * Delivery is at-least-once and not FIFO, and queue concurrency is not a fencing token, so NOTHING here depends on how many deliveries run or in what order:
 * the finaliser reads the authoritative pending rows from Google Sheets in INTAKE ORDER and converges (see finaliser.ts). A delivery runs bounded passes until the
 * sheet reports nothing left to do, within a time budget; if it must stop early it publishes a delayed wake-up so work is handed on, never dropped.
 */
import { runFinaliserPass, type PassResult } from "../finaliser";
import { parseDrainMessage } from "./messages";
import { signalDrain, type QueueTransport } from "./dispatcher";

export interface ConsumerDeps {
  pass?: (opts: { maxBatch?: number }) => Promise<PassResult>;
  transport: QueueTransport;
  now?: () => number;
  /** Time this delivery may spend before handing off (the function limit minus a safety margin). */
  budgetMs?: number;
  maxBatch?: number;
}

export interface DrainOutcome {
  ignored?: boolean;
  passes: number;
  idle: boolean;
  handedOff: boolean;
  results: PassResult[];
}

export async function handleDrain(raw: unknown, meta: { messageId: string; deliveryCount: number }, deps: ConsumerDeps): Promise<DrainOutcome> {
  const msg = parseDrainMessage(raw);
  if (!msg) {
    console.warn(`[IntakeQueue] message ${meta.messageId} is not a v1 drain signal: acknowledged and ignored (reconciliation covers any pending row)`);
    return { ignored: true, passes: 0, idle: false, handedOff: false, results: [] };
  }
  const pass = deps.pass ?? ((o) => runFinaliserPass(o));
  const now = deps.now ?? Date.now;
  const started = now();
  const budget = deps.budgetMs ?? 40_000;
  const results: PassResult[] = [];
  let idle = false;
  let handoffDelay = 0;
  do {
    const r = await pass({ maxBatch: deps.maxBatch }); // an unexpected failure (for example Sheets unreachable) throws: the queue retries the delivery
    results.push(r);
    if (r.skipped === "idle") {
      idle = true;
      break;
    }
    if (r.skipped === "busy") {
      handoffDelay = 10; // another pass holds the lease and will loop until idle; check back shortly in case it stops
      break;
    }
    if (r.aborted || (r.errorCategory && r.retryScheduled > 0)) {
      handoffDelay = r.errorCategory === "QUOTA" ? 60 : 30; // the rows carry their own retry state in Sheets; come back after a pause
      break;
    }
  } while (now() - started < budget);
  let handedOff = false;
  if (!idle) {
    // Out of time, busy, or a failed pass: hand the remaining work to a later wake-up. If even that publish fails, reconciliation covers it.
    handedOff = (await signalDrain(deps.transport, { now: now(), extraDelaySeconds: handoffDelay || 5, source: "handoff" })).published;
  }
  return { passes: results.length, idle, handedOff, results };
}

/**
 * The retry policy passed to the SDK handler. A delivery that keeps failing is acknowledged after the 8th attempt: Vercel Queues has no dead-letter queue, and
 * the evidence of every accepted submission lives in Google Sheets (its state, retry count and error category), where reconciliation redispatches it.
 */
export function intakeRetryPolicy(_error: unknown, meta: { deliveryCount: number }): { afterSeconds: number } | { acknowledge: true } {
  if (meta.deliveryCount > 8) {
    console.error("[IntakeQueue] INTEGRITY ALERT: a wake-up failed 8 deliveries and was acknowledged; accepted submissions stay in Donation_Intake and need reconciliation");
    return { acknowledge: true };
  }
  return { afterSeconds: Math.min(300, 2 ** meta.deliveryCount * 5) };
}
