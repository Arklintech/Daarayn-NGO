/**
 * lib/intake/queue/reconcile.ts  (D38, ISOLATED): the recovery path for accepted-but-unprocessed intake rows.
 *
 * The queue and the sheet are separate systems, so a wake-up can be lost (publish failure, expiry, a deleted deployment, a consumer that gave up). Google Sheets
 * is authoritative: this reads the intake rows once and, when pending rows are older than the threshold, publishes a fresh wake-up. It is safe to run any number of
 * times (a duplicate wake-up finds nothing to do) and is triggered by an authenticated admin action, a daily cron safety net, and the consumer's own handoff.
 */
import { readQueueMetrics, type QueueMetrics } from "../status";
import { signalDrain, type QueueTransport } from "./dispatcher";

export interface ReconcileResult extends QueueMetrics {
  pending: number;
  redispatched: boolean;
  publishError?: string;
}

export async function reconcileIntake(deps: { transport: QueueTransport; now?: () => number; staleAfterSec?: number }): Promise<ReconcileResult> {
  const now = deps.now ?? Date.now;
  const stale = deps.staleAfterSec ?? 60;
  const m = await readQueueMetrics(now(), stale);
  let redispatched = false;
  let publishError: string | undefined;
  if (m.depth > 0 && m.oldestPendingAgeSec >= stale) {
    const r = await signalDrain(deps.transport, { now: now(), source: "reconcile" });
    redispatched = r.published;
    publishError = r.error;
  }
  return { ...m, pending: m.depth, redispatched, ...(publishError ? { publishError } : {}) };
}
