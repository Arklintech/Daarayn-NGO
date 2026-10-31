/**
 * lib/intake/queue/messages.ts  (D38, ISOLATED)
 *
 * The ONLY thing that travels through Vercel Queues is a wake-up signal. Google Sheets stays the single authoritative store: the finaliser reads the pending
 * intake rows from the sheet itself. A message therefore carries no donor data and no financial payload, only a schema version, an event type, a correlation id,
 * a time bucket and (optionally) the public submission reference that caused the wake-up.
 */
import crypto from "crypto";

export const INTAKE_TOPIC = "daarayn-intake";
export const MESSAGE_VERSION = 1;
/**
 * A wake-up is published with a delay of COALESCE_SECONDS plus a skew margin and an idempotency key per time bucket of COALESCE_SECONDS. A second submission in the same
 * bucket has its publish deduplicated, which is safe ONLY because the single delivered message starts after the bucket has ended, so its first read sees the second row.
 */
export const COALESCE_SECONDS = 5;
export const SKEW_MARGIN_SECONDS = 1;
export const MESSAGE_RETENTION_SECONDS = 3600;

export interface DrainMessage {
  v: 1;
  type: "intake.drain";
  correlationId: string;
  /** floor(publish time / bucket length): also the idempotency key's identity, never a time the consumer relies on. */
  bucket: number;
  /** The public submission reference that triggered the wake-up (not personal data); optional. */
  hint?: string;
}

export const bucketOf = (nowMs: number) => Math.floor(nowMs / (COALESCE_SECONDS * 1000));
export type SignalSource = "accept" | "handoff" | "reconcile";
/**
 * Each source has its OWN key namespace: a recovery signal (reconcile) or a handoff must never collide with the key of a wake-up it is meant to recover. If the queue
 * ever lost a message but remembered its key, a shared key would silently swallow the recovery. Within one source and one bucket the key still coalesces.
 */
export const drainIdempotencyKey = (bucket: number, source: SignalSource = "accept") => `intake-${source}:${bucket}`;

export function buildDrainMessage(nowMs: number, hint?: string): DrainMessage {
  const m: DrainMessage = { v: MESSAGE_VERSION, type: "intake.drain", correlationId: `c-${crypto.randomBytes(6).toString("hex")}`, bucket: bucketOf(nowMs) };
  if (hint && /^SUB-[0-9A-Z]{12}$/.test(hint)) m.hint = hint;
  return m;
}

/** Strict: anything that is not exactly a v1 drain signal is not work (the consumer acknowledges and ignores it). */
export function parseDrainMessage(raw: unknown): DrainMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== MESSAGE_VERSION || o.type !== "intake.drain") return null;
  if (typeof o.correlationId !== "string" || !Number.isFinite(o.bucket)) return null;
  const out: DrainMessage = { v: 1, type: "intake.drain", correlationId: String(o.correlationId).slice(0, 64), bucket: Number(o.bucket) };
  if (typeof o.hint === "string" && /^SUB-[0-9A-Z]{12}$/.test(o.hint)) out.hint = o.hint;
  return out;
}
