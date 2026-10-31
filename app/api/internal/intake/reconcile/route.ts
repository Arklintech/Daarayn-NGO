import { NextResponse } from "next/server";
import { reconcileIntake } from "@/lib/intake/queue/reconcile";
import { vercelQueueTransport } from "@/lib/intake/queue/vercelTransport";
import { bearerMatches, intakeModeEnabled } from "@/lib/intake/runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Daily safety net (D38): redispatches accepted submissions that are still unprocessed. Vercel Cron calls it with `Authorization: Bearer ${CRON_SECRET}`
 * (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs); without CRON_SECRET the route is disabled. It never runs the finaliser itself:
 * it only publishes a wake-up, so the queue consumer stays the single path that finalises. Cost: one Sheets read.
 */
export async function GET(request: Request) {
  if (!intakeModeEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = bearerMatches(request.headers.get("authorization"), process.env.CRON_SECRET);
  if (auth === "unconfigured") return NextResponse.json({ error: "not configured" }, { status: 404 });
  if (auth === "denied") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const r = await reconcileIntake({ transport: vercelQueueTransport, staleAfterSec: 60 });
    return NextResponse.json({ pending: r.pending, stale: r.stale, needsReview: r.needsReview, oldestPendingAgeSec: r.oldestPendingAgeSec, redispatched: r.redispatched, publishError: r.publishError ? "publish failed" : undefined }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "could not read the intake queue" }, { status: 503 });
  }
}
