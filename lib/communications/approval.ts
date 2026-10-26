/**
 * lib/communications/approval.ts
 *
 * Approval binding for manual campaigns. An administrator reviews the exact content and the exact recipient set;
 * the server then issues a short-lived signed approval token bound to BOTH. Sending requires that token, and any
 * change to the content, purpose, causes or recipient set invalidates it (the hash no longer matches), so a stale or
 * altered request cannot be sent under an earlier approval.
 *
 * Key: COMMUNICATION_APPROVAL_SECRET, falling back to a value derived from other server-only secrets so it is never
 * guessable from the browser.
 */
import crypto from "crypto";

const TTL_MS = 30 * 60 * 1000;

function key(): Buffer {
  const secret =
    process.env.COMMUNICATION_APPROVAL_SECRET ||
    `${process.env.SMTP_PASS || ""}|${process.env.GOOGLE_OAUTH_CLIENT_SECRET || ""}|${process.env.GOOGLE_PRIVATE_KEY || ""}|${process.env.ADMIN_EMAILS || ""}`;
  if (!secret.replace(/\|/g, "")) throw new Error("No server secret available to sign communication approvals (set COMMUNICATION_APPROVAL_SECRET).");
  return crypto.createHash("sha256").update(`daarayn-comm-approval:${secret}`).digest();
}

export interface ApprovalContent {
  type: string;
  causeIds: string[];
  heading: string;
  notes: string;
  media: string[];
  recipientIds: string[];
}

/** Stable hash of everything an approval covers. */
export function contentHash(c: ApprovalContent): string {
  const canonical = JSON.stringify({
    t: c.type,
    c: [...new Set(c.causeIds)].sort(),
    h: c.heading.trim(),
    n: c.notes.trim(),
    m: [...c.media].sort(),
    r: [...new Set(c.recipientIds)].sort(),
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

const b64u = (b: Buffer) => b.toString("base64url");
const sign = (payload: string) => b64u(crypto.createHmac("sha256", key()).update(payload).digest());

export function issueApproval(adminEmail: string, content: ApprovalContent, now = Date.now()): { token: string; hash: string; expiresAt: string } {
  const hash = contentHash(content);
  const payload = b64u(Buffer.from(JSON.stringify({ h: hash, e: adminEmail, x: now + TTL_MS })));
  return { token: `${payload}.${sign(payload)}`, hash, expiresAt: new Date(now + TTL_MS).toISOString() };
}

export function verifyApproval(token: unknown, adminEmail: string, content: ApprovalContent, now = Date.now()): { ok: true; hash: string } | { ok: false; reason: string } {
  if (typeof token !== "string" || !token.includes(".")) return { ok: false, reason: "This campaign has not been approved. Review the recipients and message first." };
  const [payload, sig] = token.split(".");
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "The approval is not valid." };
  let data: { h: string; e: string; x: number };
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "The approval is malformed." };
  }
  if (now > data.x) return { ok: false, reason: "The approval expired. Review and approve again." };
  if (data.e !== adminEmail) return { ok: false, reason: "The approval was issued to a different administrator." };
  if (data.h !== contentHash(content)) return { ok: false, reason: "The message or the recipients changed after approval. Review and approve again." };
  return { ok: true, hash: data.h };
}
