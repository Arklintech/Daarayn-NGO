import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { googleUsageSnapshot } from "@/lib/google/usage";
import { fetchCoordinatorMetrics, limiterConfig, limiterStatus } from "@/lib/google/requestControl";
import { evaluateQuotaHealth, worst } from "@/lib/google/quotaAlerts";

export const dynamic = "force-dynamic";

/**
 * Administrator-only quota health: GLOBAL consumption from the shared coordinator (when configured and reachable) plus this instance's own
 * counters, evaluated against the alert thresholds. Technical counters only: no coordinator address, token, key names or Google data.
 */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const limiter = limiterStatus();
  const coordinator = limiter.crossInstance ? await fetchCoordinatorMetrics() : null;
  const local = googleUsageSnapshot() as any;
  const config = limiterConfig();
  const alerts = evaluateQuotaHealth({ config, coordinator, coordinatorConfigured: limiter.crossInstance, local });
  return NextResponse.json(
    { success: true, status: worst(alerts), limiter: { mode: limiter.mode, ready: limiter.ready }, budgets: { readsPerMinute: config.readsPerMinute, writesPerMinute: config.writesPerMinute, projectReadsPerMinute: config.projectReadsPerMinute, projectWritesPerMinute: config.projectWritesPerMinute, maxWaitMs: config.maxWaitMs }, coordinator, instance: { rolling: local.rolling, shed: local.shed, byKind: local.byKind }, alerts },
    { headers: { "Cache-Control": "no-store" } },
  );
}
