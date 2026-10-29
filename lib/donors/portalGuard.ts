/**
 * lib/donors/portalGuard.ts
 *
 * Shared abuse controls for the donor portal. State lives in an append-only Google Sheets tab (Portal_Auth_Events),
 * the project's single operational store, so every server instance sees the same counters. Nothing is kept in memory:
 * if the tab cannot be read or written the portal refuses (fail closed) rather than falling back to a per-instance map.
 *
 * Concurrency: an event is appended FIRST and the tab is read afterwards; a request is allowed only if its own row's
 * rank inside the window is within the limit, so simultaneous requests cannot all slip under the limit (earliest rows win).
 *
 * Privacy: IP, identifier, donor and challenge values are stored only as keyed hashes. Codes are never stored or logged.
 */
import crypto from "crypto";
import { sheetsService } from "../google/sheets";
import { registerSchema } from "../google/schemaRegistry";
import { signingKey } from "../server/signingKey";

export const PORTAL_EVENTS_TAB = "Portal_Auth_Events";
const HEADERS = ["id", "ts", "kind", "ipHash", "identHash", "donorHash", "nonceHash", "ref", "detail"];
registerSchema(PORTAL_EVENTS_TAB, HEADERS);

export const PORTAL_LIMITS = {
  requestPerIp: { max: 10, windowMs: 10 * 60 * 1000 },
  requestPerIdentifier: { max: 3, windowMs: 15 * 60 * 1000 },
  requestPerDonorHour: { max: 3, windowMs: 60 * 60 * 1000 },
  requestPerDonorDay: { max: 10, windowMs: 24 * 60 * 60 * 1000 },
  attemptPerIp: { max: 30, windowMs: 10 * 60 * 1000 },
  attemptPerChallenge: { max: 5 },
  dailyCodeCap: { windowMs: 24 * 60 * 60 * 1000 }, // max from PORTAL_DAILY_CODE_CAP, default 300
};

export class PortalGuardUnavailableError extends Error {
  constructor(cause?: unknown) {
    super(`Portal protection store unavailable: ${String((cause as any)?.message || cause || "")}`.slice(0, 200));
  }
}

const h = (purpose: string, value: string) => crypto.createHmac("sha256", signingKey("portal-guard")).update(`${purpose}|${value}`).digest("base64url").slice(0, 22);

export const normalizeIdentifier = (raw: string): string => {
  const s = String(raw || "").trim().toLowerCase();
  return s.includes("@") ? s : s.replace(/\D/g, "");
};

interface Ev { rowNumber: number; id: string; ts: number; kind: string; ipHash: string; identHash: string; donorHash: string; nonceHash: string; ref: string }

async function append(kind: string, f: Partial<Record<"ipHash" | "identHash" | "donorHash" | "nonceHash" | "ref" | "detail", string>>, now: number): Promise<{ id: string; rowNumber: number }> {
  const id = `PA-${now}-${crypto.randomBytes(4).toString("hex")}`;
  const rowNumber = await sheetsService.appendRows(PORTAL_EVENTS_TAB, [{ id, ts: new Date(now).toISOString(), kind, ...f }], HEADERS);
  return { id, rowNumber };
}

async function readAll(): Promise<Ev[]> {
  const { rows } = await sheetsService.getRowsWithNumbers(PORTAL_EVENTS_TAB);
  return rows.map((r) => ({
    rowNumber: r.rowNumber,
    id: String(r.record.id || ""),
    ts: Date.parse(String(r.record.ts || "")) || 0,
    kind: String(r.record.kind || ""),
    ipHash: String(r.record.ipHash || ""),
    identHash: String(r.record.identHash || ""),
    donorHash: String(r.record.donorHash || ""),
    nonceHash: String(r.record.nonceHash || ""),
    ref: String(r.record.ref || ""),
  }));
}

/**
 * Reads the events and finds MY row by its unique id. The row number that Sheets reports for an append is NOT reliable when appends
 * overlap (several concurrent appends were observed to report the same row), so ordering must come from where the row really is.
 * If my own row is not visible yet the read is repeated a few times; if it never appears the guard fails safe (portal unavailable).
 */
async function readWithMine(mineId: string): Promise<{ events: Ev[]; mineRow: number }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const events = await readAll();
    const mine = events.find((e) => e.id === mineId);
    if (mine) return { events, mineRow: mine.rowNumber };
    await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
  }
  throw new Error("The guard event just written could not be located.");
}

const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (err) {
    throw new PortalGuardUnavailableError(err);
  }
};

export type CodeRequestDecision =
  | { allowed: true }
  | { allowed: false; scope: "ip" | "identifier" | "donor" | "daily-cap" };

/**
 * Decides whether a code may be e-mailed for this request. `donorId` is "" for an unknown identifier: the same
 * counters (ip, identifier, global) apply either way, so the answer never reveals whether a donor exists.
 */
export async function guardCodeRequest(input: { ip: string; identifier: string; donorId: string }, now = Date.now()): Promise<CodeRequestDecision> {
  const ipHash = h("ip", input.ip || "unknown");
  const identHash = h("ident", normalizeIdentifier(input.identifier));
  const donorHash = input.donorId ? h("donor", input.donorId) : "";
  const mine = await wrap(() => append("request", { ipHash, identHash, donorHash }, now));
  const { events, mineRow } = await wrap(() => readWithMine(mine.id));

  const voided = new Set(events.filter((e) => e.kind === "request_void").map((e) => e.ref));
  const reqs = events.filter((e) => e.kind === "request" && e.rowNumber <= mineRow);
  const within = (e: Ev, ms: number) => e.ts >= now - ms;
  const rank = (list: Ev[]) => list.length; // `list` already contains only rows up to and including mine

  const cap = Math.max(1, Number(process.env.PORTAL_DAILY_CODE_CAP) || 300);
  // Every request counts toward the per-IP limit (a flood from one address is the flood, voided or not).
  // Voided (refused) requests do not count toward identifier/donor/global limits, so an attacker cannot keep a victim locked out
  // by hammering refused requests.
  const checks: [CodeRequestDecision & { allowed: false }, number, number][] = [
    [{ allowed: false, scope: "ip" }, rank(reqs.filter((e) => e.ipHash === ipHash && within(e, PORTAL_LIMITS.requestPerIp.windowMs))), PORTAL_LIMITS.requestPerIp.max],
    [{ allowed: false, scope: "identifier" }, rank(reqs.filter((e) => !voided.has(e.id) && e.identHash === identHash && within(e, PORTAL_LIMITS.requestPerIdentifier.windowMs))), PORTAL_LIMITS.requestPerIdentifier.max],
    ...(donorHash
      ? ([
          [{ allowed: false, scope: "donor" }, rank(reqs.filter((e) => !voided.has(e.id) && e.donorHash === donorHash && within(e, PORTAL_LIMITS.requestPerDonorHour.windowMs))), PORTAL_LIMITS.requestPerDonorHour.max],
          [{ allowed: false, scope: "donor" }, rank(reqs.filter((e) => !voided.has(e.id) && e.donorHash === donorHash && within(e, PORTAL_LIMITS.requestPerDonorDay.windowMs))), PORTAL_LIMITS.requestPerDonorDay.max],
        ] as [CodeRequestDecision & { allowed: false }, number, number][])
      : []),
    [{ allowed: false, scope: "daily-cap" }, rank(reqs.filter((e) => !voided.has(e.id) && within(e, PORTAL_LIMITS.dailyCodeCap.windowMs))), cap],
  ];
  for (const [decision, count, max] of checks) {
    if (count > max) {
      await wrap(() => append("request_void", { ref: mine.id, ipHash, detail: decision.scope }, now));
      return decision;
    }
  }
  return { allowed: true };
}

export type AttemptDecision = { ok: true; consume: () => Promise<boolean> } | { ok: false; reason: "ip-limit" | "attempts" | "used" };

/**
 * Called BEFORE the code is compared. Counts the attempt, refuses once a challenge has had its guesses or was already
 * consumed. On a correct code the caller must call `consume()`, which atomically claims the one use (false = lost a race).
 */
export async function guardCodeAttempt(input: { ip: string; nonce: string }, now = Date.now()): Promise<AttemptDecision> {
  const ipHash = h("ip", input.ip || "unknown");
  const nonceHash = h("nonce", input.nonce);
  const mine = await wrap(() => append("attempt", { ipHash, nonceHash }, now));
  const { events, mineRow } = await wrap(() => readWithMine(mine.id));

  const upToMine = events.filter((e) => e.rowNumber <= mineRow);
  if (upToMine.filter((e) => e.kind === "attempt" && e.ipHash === ipHash && e.ts >= now - PORTAL_LIMITS.attemptPerIp.windowMs).length > PORTAL_LIMITS.attemptPerIp.max) {
    return { ok: false, reason: "ip-limit" };
  }
  if (events.some((e) => e.kind === "consumed" && e.nonceHash === nonceHash)) return { ok: false, reason: "used" };
  if (upToMine.filter((e) => e.kind === "attempt" && e.nonceHash === nonceHash).length > PORTAL_LIMITS.attemptPerChallenge.max) {
    return { ok: false, reason: "attempts" };
  }
  return {
    ok: true,
    consume: async () => {
      const claim = await wrap(() => append("consumed", { nonceHash, ref: mine.id }, now));
      const { events: after } = await wrap(() => readWithMine(claim.id));
      const first = after.filter((e) => e.kind === "consumed" && e.nonceHash === nonceHash).sort((a, b) => a.rowNumber - b.rowNumber)[0];
      return !!first && first.id === claim.id; // compared by id: the row number reported by an append is not reliable under concurrency
    },
  };
}
