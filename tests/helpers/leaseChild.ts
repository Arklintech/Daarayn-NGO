/** Entry of an independent OS process: repeatedly takes the coordinator lease for one resource, "works" for a while and reports the exclusive intervals. */
import { withLease, CoordinatorLeaseBackend } from "@/lib/google/allocationLease";

const url = process.env.GOOGLE_LIMITER_URL!;
const token = process.env.GOOGLE_LIMITER_TOKEN!;
const rounds = Number(process.env.CHILD_ROUNDS || 3);
const workMs = Number(process.env.CHILD_WORK_MS || 150);
const intervals: { start: number; end: number; token: number }[] = [];
(async () => {
  const backend = new CoordinatorLeaseBackend(url, token, 1500);
  for (let i = 0; i < rounds; i++) {
    await withLease("alloc:TEST-DONATION", async (lease) => {
      const start = Date.now();
      await new Promise((r) => setTimeout(r, workMs));
      intervals.push({ start, end: Date.now(), token: lease.token });
    }, { backend, ttlMs: 3000, acquireTimeoutMs: 60000 });
  }
  console.log(JSON.stringify({ pid: process.pid, intervals }));
  process.exit(0);
})().catch((e) => { console.log(JSON.stringify({ pid: process.pid, error: String(e?.code || e?.message) })); process.exit(0); });
