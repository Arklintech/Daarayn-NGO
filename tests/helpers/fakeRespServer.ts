/** Local EMULATION of a Redis server speaking RESP over TCP for the one limiter script (AUTH + EVAL). Not a real Redis. */
import net from "net";
import { createRequire } from "module";
import { RESERVE_LUA } from "@/lib/google/requestControl";

const { evalReserve } = createRequire(import.meta.url)("../../tools/limiter-server/gcra.cjs") as { evalReserve: (store: Map<string, number>, keys: string[], argv: unknown[], now: number) => number };

export interface FakeResp { url: string; password: string; calls: number; down: boolean; stop(): Promise<void> }

function parseCommands(buf: Buffer): { cmds: string[][]; rest: Buffer } {
  const cmds: string[][] = [];
  let pos = 0;
  for (;;) {
    if (buf[pos] !== 0x2a) break; // '*'
    let eol = buf.indexOf("\r\n", pos);
    if (eol < 0) break;
    const n = Number(buf.toString("utf8", pos + 1, eol));
    let p = eol + 2;
    const args: string[] = [];
    let ok = true;
    for (let i = 0; i < n; i++) {
      eol = buf.indexOf("\r\n", p);
      if (eol < 0) { ok = false; break; }
      const len = Number(buf.toString("utf8", p + 1, eol));
      if (buf.length < eol + 2 + len + 2) { ok = false; break; }
      args.push(buf.toString("utf8", eol + 2, eol + 2 + len));
      p = eol + 2 + len + 2;
    }
    if (!ok) break;
    cmds.push(args);
    pos = p;
  }
  return { cmds, rest: buf.subarray(pos) };
}

export async function startFakeResp(password = "resp-secret"): Promise<FakeResp> {
  const store = new Map<string, number>();
  const state: FakeResp = { url: "", password, calls: 0, down: false, stop: async () => {} };
  const sockets = new Set<net.Socket>();
  const server = net.createServer((sock) => {
    sockets.add(sock);
    sock.on("close", () => sockets.delete(sock));
    if (state.down) return sock.destroy();
    let buf = Buffer.alloc(0);
    let authed = false;
    sock.on("error", () => undefined);
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      const { cmds, rest } = parseCommands(buf);
      buf = Buffer.from(rest);
      for (const c of cmds) {
        if (c[0] === "AUTH") { authed = c[c.length - 1] === password; sock.write(authed ? "+OK\r\n" : "-ERR invalid password\r\n"); continue; }
        if (!authed) { sock.write("-NOAUTH Authentication required\r\n"); continue; }
        if (c[0] === "EVAL" && c[1] === RESERVE_LUA) {
          state.calls++;
          const [, , , k1, k2, interval, burst, penalty, pint, pburst] = c;
          sock.write(`:${evalReserve(store, [k1, k2], [interval, burst, penalty, pint, pburst], Date.now())}\r\n`);
        } else sock.write("-ERR unknown command\r\n");
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  state.url = `redis://:${password}@127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  state.stop = () => new Promise<void>((r) => { sockets.forEach((s) => s.destroy()); server.close(() => r()); });
  return state;
}
