/**
 * lib/communications/attachments.ts
 *
 * How the files of a campaign reach donors, decided deterministically from file identity so that what an administrator
 * approves is exactly what is delivered:
 *   - uploaded Drive files are bound to their content fingerprint (Drive md5). A file that is replaced, trashed or removed
 *     after approval stops the send;
 *   - files are attached directly while the running total stays within DIRECT_BUDGET_BYTES, in the order given; any file
 *     beyond that is delivered as a personal, expiring, signed link instead (the Drive file itself stays private: no Drive
 *     permission is ever changed, the app serves it at /api/files/share/<token> after checking the token and the fingerprint);
 *   - external https links stay plain links to their public address.
 */
import crypto from "crypto";
import { driveService } from "../google/drive";
import { signingKey } from "../server/signingKey";

/** Gmail rejects messages over 25 MB and base64 adds about a third, so keep attached bytes well under that. */
const DEFAULT_DIRECT_BUDGET_BYTES = 15 * 1024 * 1024;
/** Operators can lower (never raise past the Gmail-safe default) the attachment budget with ATTACHMENT_DIRECT_BUDGET_MB. */
export const directBudgetBytes = () => {
  const mb = Number(process.env.ATTACHMENT_DIRECT_BUDGET_MB);
  return mb > 0 ? Math.min(mb * 1024 * 1024, DEFAULT_DIRECT_BUDGET_BYTES) : DEFAULT_DIRECT_BUDGET_BYTES;
};
export const DIRECT_BUDGET_BYTES = DEFAULT_DIRECT_BUDGET_BYTES;
export const LINK_TTL_DAYS_DEFAULT = 30;

export interface MediaItem {
  url: string;
  kind: "drive" | "external";
  driveId?: string;
  name: string;
  size: number;
  fingerprint: string;
  delivery: "attach" | "link";
}

export class MediaError extends Error {}

const DRIVE_RE = /\/api\/media\/([^/?#]+)/;

/** Reads identity of every media entry; throws MediaError naming any file that is missing, trashed or unreadable. */
export async function inspectMedia(media: string[]): Promise<MediaItem[]> {
  const items: MediaItem[] = [];
  const problems: string[] = [];
  for (const url of media) {
    const m = url.match(DRIVE_RE);
    if (!m) {
      items.push({ url, kind: "external", name: decodeURIComponent(url.split("?")[0].split("/").filter(Boolean).pop() || url), size: 0, fingerprint: "url", delivery: "attach" });
      continue;
    }
    const driveId = decodeURIComponent(m[1]);
    try {
      const info = await driveService.getFileInfo(driveId);
      if (info.trashed) throw new Error("trashed");
      items.push({ url, kind: "drive", driveId, name: info.name, size: info.size, fingerprint: info.fingerprint, delivery: "attach" });
    } catch (e: any) {
      problems.push(`${driveId} (${/trashed/.test(String(e?.message)) ? "removed" : "not found or not accessible"})`);
    }
  }
  if (problems.length) throw new MediaError(`Attachment unavailable: ${problems.join(", ")}. Nothing was approved or sent; fix or remove it.`);
  return planDelivery(items);
}

/** Greedy in the given order: attach while within the budget, otherwise deliver as a secure link. */
export function planDelivery(items: MediaItem[]): MediaItem[] {
  let used = 0;
  return items.map((i) => {
    if (i.kind === "external") return i;
    if (used + i.size <= directBudgetBytes()) {
      used += i.size;
      return { ...i, delivery: "attach" as const };
    }
    return { ...i, delivery: "link" as const };
  });
}

/** What the approval covers about the files: identity, not just the URL. */
export const mediaFingerprints = (items: MediaItem[]) => items.map((i) => `${i.url}#${i.fingerprint}#${i.size}`);

// ---------- personal share links ----------
const b64u = (b: Buffer) => b.toString("base64url");
const sign = (payload: string) => b64u(crypto.createHmac("sha256", signingKey("attachment-link")).update(payload).digest());
const ttlMs = () => (Number(process.env.ATTACHMENT_LINK_TTL_DAYS) || LINK_TTL_DAYS_DEFAULT) * 24 * 60 * 60 * 1000;

export interface ShareClaims { f: string; p: string; b: string; r: string; x: number }

/** `fingerprint` pins the link to the approved content; `recipient` is a hash, never the address. */
export function issueShareToken(input: { driveId: string; fingerprint: string; broadcastId: string; recipient: string }, now = Date.now()): string {
  const claims: ShareClaims = {
    f: input.driveId,
    p: input.fingerprint,
    b: input.broadcastId,
    r: crypto.createHash("sha256").update(input.recipient).digest("base64url").slice(0, 12),
    x: now + ttlMs(),
  };
  const payload = b64u(Buffer.from(JSON.stringify(claims)));
  return `${payload}.${sign(payload)}`;
}

export function readShareToken(token: unknown, now = Date.now()): { ok: true; claims: ShareClaims } | { ok: false; reason: "invalid" | "expired" } {
  if (typeof token !== "string" || !token.includes(".")) return { ok: false, reason: "invalid" };
  const [payload, sig] = token.split(".");
  const a = Buffer.from(sig || "");
  const b = Buffer.from(sign(payload || ""));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "invalid" };
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ShareClaims;
    if (!claims.f || typeof claims.x !== "number") return { ok: false, reason: "invalid" };
    return claims.x < now ? { ok: false, reason: "expired" } : { ok: true, claims };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

export const shareUrl = (siteUrl: string, token: string) => `${siteUrl.replace(/\/$/, "")}/api/files/share/${token}`;
