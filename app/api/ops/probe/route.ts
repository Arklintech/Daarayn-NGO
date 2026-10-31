import { NextResponse } from "next/server";
import crypto from "crypto";
import { acquireSlot, runWithPriority, limiterStatus, type Priority } from "@/lib/google/requestControl";

export const dynamic = "force-dynamic";

/** Identity of THIS function instance: random, created once when the module is loaded in a new instance. It contains nothing secret or personal. */
const INSTANCE_ID = crypto.randomBytes(6).toString("hex");
const BOOTED_AT = Date.now();
let served = 0;

/**
 * Preview and test only: takes `n` (1 to 5) request slots from the shared coordinator WITHOUT making any Google request and reports which function
 * instance served the call, how long the slots made it wait, and whether it was refused. Running many of these in parallel against a deployed
 * Preview proves (a) how many independent instances answered and (b) that they all draw from ONE budget. Protected by OPS_MONITOR_TOKEN and
 * disabled (404) in production environments; remove it after the acceptance tests.
 */
export async function GET(request: Request) {
  const production = (process.env.VERCEL_ENV || "").trim() === "production" || (process.env.GOOGLE_TARGET_ENV || "").trim() === "production";
  const expected = (process.env.OPS_MONITOR_TOKEN || "").trim();
  if (production || expected.length < 24) return NextResponse.json({ error: "not available" }, { status: 404 });
  const given = Buffer.from(request.headers.get("authorization") || "");
  const want = Buffer.from(`Bearer ${expected}`);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = new URL(request.url).searchParams;
  const kind = q.get("kind") === "write" ? "write" : "read";
  const priority = (["P0", "P1", "P2", "P3"].includes(q.get("priority") || "") ? q.get("priority") : "P3") as Priority;
  const n = Math.min(5, Math.max(1, Number(q.get("n")) || 1));
  served++;
  const started = Date.now();
  let waitedMs = 0;
  let granted = 0;
  let refused: string | null = null;
  try {
    await runWithPriority(priority, async () => {
      for (let i = 0; i < n; i++) {
        waitedMs += await acquireSlot(kind, process.env, priority);
        granted++;
      }
    });
  } catch (e: any) {
    refused = String(e?.code || e?.name || "refused");
  }
  const limiter = limiterStatus();
  return NextResponse.json(
    { instance: INSTANCE_ID, bootedAt: new Date(BOOTED_AT).toISOString(), servedByThisInstance: served, region: process.env.VERCEL_REGION || null, deployment: process.env.VERCEL_DEPLOYMENT_ID || null, limiterMode: limiter.mode, limiterReady: limiter.ready, kind, priority, requested: n, granted, refused, waitedMs, elapsedMs: Date.now() - started },
    { status: refused ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
