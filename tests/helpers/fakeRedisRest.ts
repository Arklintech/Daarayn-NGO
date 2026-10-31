/**
 * Local EMULATION of a Redis-compatible REST coordinator (Upstash-style: POST a JSON command array, Bearer token, {"result": ...}).
 * It is NOT a real Redis and proves nothing about a managed service; it runs the same reservation arithmetic as RESERVE_LUA in one
 * synchronous step per request (so, like a Redis script, each EVAL is atomic) over real HTTP sockets, which lets several independent
 * clients be tested against ONE budget. Failure injection: down, delayMs, status.
 */
import http from "http";
import type { AddressInfo } from "net";
import { createRequire } from "module";
import { RESERVE_LUA } from "@/lib/google/requestControl";

const { evalReserve } = createRequire(import.meta.url)("../../tools/limiter-server/gcra.cjs") as { evalReserve: (store: Map<string, number>, keys: string[], argv: unknown[], now: number) => number };

export interface FakeRedis {
  url: string;
  token: string;
  calls: number;
  mode: { down: boolean; delayMs: number; status: number };
  keys: Map<string, number>;
  /** Slot time (server clock, ms) granted to each reservation, per key. */
  grants: Map<string, number[]>;
  stop(): Promise<void>;
}

export async function startFakeRedisRest(token = "test-token"): Promise<FakeRedis> {
  const keys = new Map<string, number>();
  const grants = new Map<string, number[]>();
  const state: FakeRedis = { url: "", token, grants, calls: 0, mode: { down: false, delayMs: 0, status: 200 }, keys, stop: async () => {} };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      state.calls++;
      if (state.mode.down) return req.socket.destroy();
      if (state.mode.delayMs) await new Promise((r) => setTimeout(r, state.mode.delayMs));
      if (state.mode.status !== 200) {
        res.writeHead(state.mode.status);
        return res.end("{}");
      }
      if (req.headers.authorization !== `Bearer ${token}`) {
        res.writeHead(401);
        return res.end(JSON.stringify({ error: "unauthorized" }));
      }
      const cmd = JSON.parse(raw);
      let result: unknown = null;
      if (cmd[0] === "EVAL" && cmd[1] === RESERVE_LUA) {
        const [, , , key, pkey, intervalRaw, burstRaw, penaltyRaw, pint, pburst, maxw] = cmd;
        const now = Date.now();
        const before = Math.max(keys.get(key) ?? 0, now);
        result = evalReserve(keys, [key, pkey], [intervalRaw, burstRaw, penaltyRaw, pint, pburst, maxw], now);
        if (Number(penaltyRaw) <= 0 && Number(result) >= 0) (grants.get(key) ?? grants.set(key, []).get(key)!).push(now + Math.max(0, before - now - (Number(burstRaw) - 1) * Number(intervalRaw)));
      } else {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: "unsupported command" }));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ result }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  state.stop = () => new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); });
  return state;
}
