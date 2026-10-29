/** Entry of an independent OS process for tests/shared-limiter-processes.test.ts: takes N slots from the shared coordinator and prints when each was granted. */
import { acquireSlot, penalizeKind } from "@/lib/google/requestControl";

const n = Number(process.env.CHILD_COUNT || 0);
const kind = (process.env.CHILD_KIND || "read") as "read" | "write";
const penalty = Number(process.env.CHILD_PENALTY_MS || 0);
const grants: number[] = [];
(async () => {
  if (penalty > 0) await penalizeKind(kind, penalty);
  await Promise.all(Array.from({ length: n }, async () => { await acquireSlot(kind); grants.push(Date.now()); }));
  console.log(JSON.stringify({ pid: process.pid, grants: grants.sort((a, b) => a - b) }));
  process.exit(0); // do not wait for idle keep-alive sockets
})().catch((e) => { console.log(JSON.stringify({ pid: process.pid, error: String(e?.code || e?.message) })); process.exit(0); });
