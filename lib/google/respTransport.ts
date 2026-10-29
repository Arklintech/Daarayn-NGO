/**
 * Minimal Redis (RESP2) client over TCP/TLS for ONE command per connection, so the limiter works with any Redis-compatible server
 * (`redis://` or `rediss://` URL) and not only with a REST front end. Server-only. One connection per command suits serverless functions
 * (no idle sockets to keep alive); the cost is one connection set-up per reservation.
 */
import net from "net";
import tls from "tls";

type Reply = string | number | null | Reply[] | Error;

function parse(buf: Buffer, pos = 0): { value: Reply; next: number } | null {
  if (pos >= buf.length) return null;
  const type = String.fromCharCode(buf[pos]);
  const eol = buf.indexOf("\r\n", pos);
  if (eol < 0) return null;
  const line = buf.toString("utf8", pos + 1, eol);
  if (type === "+") return { value: line, next: eol + 2 };
  if (type === "-") return { value: new Error(line), next: eol + 2 };
  if (type === ":") return { value: Number(line), next: eol + 2 };
  if (type === "$") {
    const len = Number(line);
    if (len < 0) return { value: null, next: eol + 2 };
    if (buf.length < eol + 2 + len + 2) return null;
    return { value: buf.toString("utf8", eol + 2, eol + 2 + len), next: eol + 2 + len + 2 };
  }
  if (type === "*") {
    const n = Number(line);
    if (n < 0) return { value: null, next: eol + 2 };
    const out: Reply[] = [];
    let p = eol + 2;
    for (let i = 0; i < n; i++) {
      const r = parse(buf, p);
      if (!r) return null;
      out.push(r.value);
      p = r.next;
    }
    return { value: out, next: p };
  }
  throw new Error("unexpected RESP reply");
}

export const encodeCommand = (args: (string | number)[]) => {
  const parts = args.map((a) => Buffer.from(String(a), "utf8"));
  return Buffer.concat([Buffer.from(`*${parts.length}\r\n`), ...parts.flatMap((p) => [Buffer.from(`$${p.length}\r\n`), p, Buffer.from("\r\n")])]);
};

/** Runs [AUTH,] command on a fresh connection and resolves with the reply of the command. Rejects on timeout, socket error or an error reply. */
export function respCommand(redisUrl: string, args: (string | number)[], timeoutMs: number): Promise<unknown> {
  const u = new URL(redisUrl);
  const secure = u.protocol === "rediss:";
  const port = Number(u.port || 6379);
  const commands: (string | number)[][] = [];
  if (u.password) commands.push(u.username && u.username !== "default" ? ["AUTH", decodeURIComponent(u.username), decodeURIComponent(u.password)] : ["AUTH", decodeURIComponent(u.password)]);
  commands.push(args);
  return new Promise((resolve, reject) => {
    let done = false;
    let buf = Buffer.alloc(0);
    let pos = 0;
    let seen = 0;
    let timer: ReturnType<typeof setTimeout>;
    let socket: net.Socket;
    const finish = (err: Error | null, value?: unknown) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      if (err) reject(err);
      else resolve(value);
    };
    const onConnect = () => socket.write(Buffer.concat(commands.map(encodeCommand)));
    socket = secure ? tls.connect({ host: u.hostname, port, servername: u.hostname }, onConnect) : net.connect({ host: u.hostname, port }, onConnect);
    timer = setTimeout(() => finish(new Error("coordinator timeout")), timeoutMs);
    socket.on("error", (e) => finish(e));
    socket.on("close", () => finish(new Error("coordinator closed the connection")));
    socket.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        const r = parse(buf, pos);
        if (!r) return;
        pos = r.next;
        seen++;
        if (r.value instanceof Error) return finish(new Error("coordinator error reply"));
        if (seen === commands.length) return finish(null, r.value);
      }
    });
  });
}
