/**
 * lib/intake/queue/dispatcher.ts  (D38, ISOLATED): publishes the wake-up signal. Publication is best effort BY DESIGN: the intake row is already durable in
 * Google Sheets, so a failed publish never fails or reverses an accepted submission; it is counted, and the reconciliation path redispatches any accepted row
 * that is still unprocessed. The queue is a trigger, never the record.
 */
import { buildDrainMessage, bucketOf, drainIdempotencyKey, COALESCE_SECONDS, SKEW_MARGIN_SECONDS, MESSAGE_RETENTION_SECONDS, type DrainMessage, type SignalSource } from "./messages";

export interface QueueTransport {
  send(message: DrainMessage, opts: { idempotencyKey: string; delaySeconds: number; retentionSeconds: number }): Promise<void>;
}

/** Counters of THIS server instance only (a serverless instance is short lived); the durable truth is the state of the intake rows. */
export const publishStats = { published: 0, failures: 0, lastFailureAt: 0, lastError: "" };
export function resetPublishStats() {
  publishStats.published = 0;
  publishStats.failures = 0;
  publishStats.lastFailureAt = 0;
  publishStats.lastError = "";
}

export async function signalDrain(transport: QueueTransport, opts: { now?: number; hint?: string; extraDelaySeconds?: number; source?: SignalSource } = {}): Promise<{ published: boolean; error?: string }> {
  const now = opts.now ?? Date.now();
  const extra = Math.max(0, Math.floor(opts.extraDelaySeconds ?? 0));
  // A handoff signal (a retry later) is keyed by the bucket it will be visible in, so it can never collide with the key of the wake-up that is running now.
  const message = buildDrainMessage(now + extra * 1000, opts.hint);
  try {
    await transport.send(message, { idempotencyKey: drainIdempotencyKey(bucketOf(now + extra * 1000), opts.source ?? "accept"), delaySeconds: COALESCE_SECONDS + SKEW_MARGIN_SECONDS + extra, retentionSeconds: MESSAGE_RETENTION_SECONDS });
    publishStats.published++;
    return { published: true };
  } catch (err: any) {
    publishStats.failures++;
    publishStats.lastFailureAt = now;
    publishStats.lastError = String(err?.message || err).slice(0, 200);
    return { published: false, error: publishStats.lastError };
  }
}
