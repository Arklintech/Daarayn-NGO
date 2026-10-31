/**
 * lib/intake/queue/vercelTransport.ts  (D38, ISOLATED): the production transport over the official SDK, using ONLY documented options of `send`
 * (https://vercel.com/docs/queues/sdk): idempotencyKey, delaySeconds, retentionSeconds. It is the only module that imports @vercel/queue.
 * The experimental `experimental_concurrencyKey` option is deliberately NOT used (it is not in the published documentation).
 */
import { send } from "@vercel/queue";
import { INTAKE_TOPIC } from "./messages";
import type { QueueTransport } from "./dispatcher";

export const vercelQueueTransport: QueueTransport = {
  async send(message, opts) {
    await send(INTAKE_TOPIC, message, { idempotencyKey: opts.idempotencyKey, delaySeconds: opts.delaySeconds, retentionSeconds: opts.retentionSeconds });
  },
};
