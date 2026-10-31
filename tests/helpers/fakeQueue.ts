/**
 * A stand-in for Vercel Queues that follows the DOCUMENTED semantics (https://vercel.com/docs/queues/concepts):
 *  - at-least-once delivery: a handler that throws (or "times out") gets the message again with deliveryCount + 1, after the retry delay;
 *  - a message is delivered only after its delay;
 *  - an idempotency key drops a repeated publish within min(retention, 24 h) (the docs do not say what happens to the key after acknowledgement, so this fake
 *    keeps the key for the whole window, which is the case the design must survive; `forgetKeysOnAck` models the other reading);
 *  - messages expire after their retention and after maxDeliveries (there is NO dead-letter queue: an expired message is simply gone);
 *  - no FIFO guarantee (`shuffle`), and a delivered message can be redelivered after acknowledgement (`redeliverAfterAck`).
 * It runs on a virtual clock the test controls. It is a model of the documentation, not a measurement of Vercel.
 */
export interface FakeMessage {
  id: string;
  payload: unknown;
  key?: string;
  visibleAt: number;
  expiresAt: number;
  deliveries: number;
}
export interface QueueMeta {
  messageId: string;
  deliveryCount: number;
}
export interface FakeQueueOptions {
  maxDeliveries?: number;
  retryAfterMs?: number;
  forgetKeysOnAck?: boolean;
  redeliverAfterAck?: boolean;
  shuffle?: boolean;
}

export class FakeQueue {
  now = 1_000_000;
  messages: FakeMessage[] = [];
  keys = new Map<string, number>();
  sent = 0;
  deduped = 0;
  delivered = 0;
  dropped: FakeMessage[] = [];
  sendFailures: Error[] = [];
  private seq = 0;
  constructor(private o: FakeQueueOptions = {}) {}

  /** The transport the application uses. */
  transport = {
    send: async (message: unknown, opts: { idempotencyKey: string; delaySeconds: number; retentionSeconds: number }) => {
      const failure = this.sendFailures.shift();
      if (failure) throw failure;
      const window = Math.min(opts.retentionSeconds, 24 * 3600) * 1000;
      const seen = this.keys.get(opts.idempotencyKey);
      if (seen !== undefined && seen + window > this.now) {
        this.deduped++;
        return;
      }
      this.keys.set(opts.idempotencyKey, this.now);
      this.sent++;
      this.messages.push({ id: `m${++this.seq}`, payload: JSON.parse(JSON.stringify(message)), key: opts.idempotencyKey, visibleAt: this.now + opts.delaySeconds * 1000, expiresAt: this.now + opts.retentionSeconds * 1000, deliveries: 0 });
    },
  };

  advance(ms: number) {
    this.now += ms;
    this.messages = this.messages.filter((m) => {
      if (m.expiresAt <= this.now) {
        this.dropped.push(m);
        return false;
      }
      return true;
    });
  }
  pending() {
    return this.messages.length;
  }
  /** Delivers every message that is due, once each, sequentially. A thrown error means "not acknowledged": redelivery after the retry delay. */
  async deliverDue(handler: (payload: unknown, meta: QueueMeta) => Promise<void>): Promise<number> {
    let n = 0;
    const due = this.messages.filter((m) => m.visibleAt <= this.now);
    if (this.o.shuffle) due.reverse();
    for (const m of due) {
      m.deliveries++;
      this.delivered++;
      n++;
      try {
        await handler(m.payload, { messageId: m.id, deliveryCount: m.deliveries });
        this.messages = this.messages.filter((x) => x !== m);
        if (this.o.forgetKeysOnAck && m.key) this.keys.delete(m.key);
        if (this.o.redeliverAfterAck) this.messages.push({ ...m, visibleAt: this.now, deliveries: m.deliveries });
      } catch {
        if (this.o.maxDeliveries && m.deliveries >= this.o.maxDeliveries) {
          this.messages = this.messages.filter((x) => x !== m);
          this.dropped.push(m);
        } else m.visibleAt = this.now + (this.o.retryAfterMs ?? 30_000);
      }
    }
    return n;
  }
}
