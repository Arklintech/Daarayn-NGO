import { NextResponse } from "next/server";
import crypto from "crypto";
import { googleUsageSnapshot } from "@/lib/google/usage";
import { fetchCoordinatorMetrics, limiterConfig, limiterStatus } from "@/lib/google/requestControl";
import { evaluateQuotaHealth, worst, type Severity } from "@/lib/google/quotaAlerts";

export const dynamic = "force-dynamic";

const rank: Record<Severity, number> = { ok: 0, warning: 1, high: 2, critical: 3 };

/**
 * Machine-readable quota status for an EXTERNAL monitor (for example a Cloud Monitoring uptime check that sends the header
 * `Authorization: Bearer <OPS_MONITOR_TOKEN>`). It answers HTTP 200 while the status is below `?min=` (warning | high | critical, default high)
 * and HTTP 503 at or above it, so an uptime check with a status-code assertion becomes an alert policy: min=warning (70 %), min=high (80 %), min=critical (90 %,
 * coordinator unreachable or uncertain). It costs one request to the coordinator and NO Google Sheets request, so monitoring never consumes the donation budget.
 * It never returns the coordinator address, tokens, key names or any Google data. When OPS_MONITOR_TOKEN is not set the route is disabled (404).
 */
export async function GET(request: Request) {
  const expected = (process.env.OPS_MONITOR_TOKEN || "").trim();
  if (expected.length < 24) return NextResponse.json({ error: "not configured" }, { status: 404 });
  const given = Buffer.from(request.headers.get("authorization") || "");
  const want = Buffer.from(`Bearer ${expected}`);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const minParam = new URL(request.url).searchParams.get("min") || "high";
  const min: Severity = minParam === "warning" || minParam === "critical" ? (minParam as Severity) : "high";
  const limiter = limiterStatus();
  const coordinator = limiter.crossInstance ? await fetchCoordinatorMetrics() : null;
  const alerts = evaluateQuotaHealth({ config: limiterConfig(), coordinator, coordinatorConfigured: limiter.crossInstance, local: googleUsageSnapshot() as any });
  const status = worst(alerts);
  const breach = rank[status] >= rank[min];
  return NextResponse.json({ status, threshold: min, breach, alerts: alerts.map((a) => ({ code: a.code, severity: a.severity })) }, { status: breach ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
