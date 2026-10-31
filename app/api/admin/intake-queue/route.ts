import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { readQueueSnapshot } from "@/lib/intake/status";
import { requeueIntake } from "@/lib/intake/finaliser";
import { reconcileIntake } from "@/lib/intake/queue/reconcile";
import { publishStats, signalDrain } from "@/lib/intake/queue/dispatcher";
import { vercelQueueTransport } from "@/lib/intake/queue/vercelTransport";
import { intakeModeEnabled, isSubmissionReference } from "@/lib/intake/runtime";
import { auditLogRepository } from "@/lib/repositories/auditLogRepository";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Admin view and actions for the queued intake (D38). Reading costs ONE Sheets read. Every manual action (requeue a row that needs review, redispatch the wake-up)
 * is audited FIRST and refused when the audit record cannot be written: an intervention that leaves no trace is not allowed to happen.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  try {
    const snapshot = await readQueueSnapshot();
    return NextResponse.json(
      {
        success: true,
        readAt: new Date().toISOString(),
        mode: { queuedIntakeEnabled: intakeModeEnabled(), cronSecretConfigured: (process.env.CRON_SECRET || "").trim().length >= 24 },
        // counters of the instance that served this request only (a serverless instance is short lived); the rows above are the durable truth
        publishing: { thisInstance: { published: publishStats.published, failures: publishStats.failures, lastFailureAt: publishStats.lastFailureAt || null, lastError: publishStats.lastError || null } },
        alarm: snapshot.stale > 0 || snapshot.needsReview > 0 ? (snapshot.needsReview > 0 ? "review" : "backlog") : "ok",
        ...snapshot,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ success: false, error: "The intake queue could not be read from Google Sheets." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  if (!intakeModeEnabled()) return NextResponse.json({ success: false, error: "Queued intake is not enabled." }, { status: 404 });
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const action = String(body?.action || "");
  const ref = String(body?.ref || "").toUpperCase();
  if (action !== "requeue" && action !== "redispatch") return NextResponse.json({ success: false, error: "Unsupported action." }, { status: 400 });
  if (action === "requeue" && !isSubmissionReference(ref)) return NextResponse.json({ success: false, error: "A valid submission reference is required." }, { status: 400 });

  // Audit FIRST: no audit record, no intervention.
  try {
    await auditLogRepository.append({
      id: `AUDIT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      actor_id: admin.email,
      actor_role: "admin",
      action: action === "requeue" ? "INTAKE_REQUEUE" : "INTAKE_REDISPATCH",
      entity_type: "DonationIntake",
      entity_id: action === "requeue" ? ref : "queue",
      before_state: null,
      after_state: { requested: action },
      timestamp: new Date().toISOString(),
      source: "admin_intake_queue",
    });
  } catch {
    return NextResponse.json({ success: false, error: "The action was NOT performed because its audit record could not be written. Try again." }, { status: 503 });
  }
  try {
    if (action === "requeue") {
      const ok = await requeueIntake(ref);
      if (!ok) return NextResponse.json({ success: false, error: "That reference is not waiting for review." }, { status: 409 });
      const wake = await signalDrain(vercelQueueTransport, { hint: ref });
      return NextResponse.json({ success: true, requeued: ref, wakeUpPublished: wake.published });
    }
    const r = await reconcileIntake({ transport: vercelQueueTransport, staleAfterSec: 0 });
    return NextResponse.json({ success: true, pending: r.pending, redispatched: r.redispatched });
  } catch {
    return NextResponse.json({ success: false, error: "The action failed after it was audited. Check the queue and try again." }, { status: 503 });
  }
}
