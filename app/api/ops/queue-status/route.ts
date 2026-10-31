import { NextResponse } from "next/server";
import { readQueueMetrics } from "@/lib/intake/status";
import { bearerMatches, intakeModeEnabled } from "@/lib/intake/runtime";

export const dynamic = "force-dynamic";

/**
 * Machine-readable queue health for an EXTERNAL monitor (D38), the same pattern as /api/ops/quota-status: header `Authorization: Bearer <OPS_MONITOR_TOKEN>`,
 * HTTP 200 while healthy and 503 on a breach, so an uptime check with a status-code assertion becomes an alert policy. A breach is: a pending row older than
 * `?maxAge=` seconds (default 900), or any row that needs review. It returns counts only (no references, no donor data). One call = ONE Google Sheets read:
 * poll it every few minutes, not every few seconds. This route proves ALERT READINESS; delivery of an alert needs a configured recipient and a real incident.
 */
export async function GET(request: Request) {
  if (!intakeModeEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = bearerMatches(request.headers.get("authorization"), process.env.OPS_MONITOR_TOKEN);
  if (auth === "unconfigured") return NextResponse.json({ error: "not configured" }, { status: 404 });
  if (auth === "denied") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const maxAge = Math.max(30, Number(new URL(request.url).searchParams.get("maxAge")) || 900);
  try {
    const m = await readQueueMetrics(Date.now(), maxAge);
    const breach = m.stale > 0 || m.needsReview > 0;
    return NextResponse.json({ status: breach ? "breach" : "ok", threshold: { maxAgeSec: maxAge }, depth: m.depth, oldestPendingAgeSec: m.oldestPendingAgeSec, stale: m.stale, needsReview: m.needsReview, retryTotal: m.retryTotal }, { status: breach ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unknown", error: "could not read the intake queue" }, { status: 503 });
  }
}
