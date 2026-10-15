import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrAgent } from "@/lib/server/auth";
import { realtimeBroadcaster } from "@/lib/realtime/broadcaster";
import { RealtimeEvent, type RealtimeMessage } from "@/lib/realtime/events";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// End the response before the platform does; EventSource reconnects with
// Last-Event-ID and the replay below fills in anything in between.
const STREAM_LIFETIME_MS = 280_000;
const HEARTBEAT_MS = 15_000;

export async function GET(request: NextRequest) {
  const principal = await requireAdminOrAgent(request);
  if (principal instanceof NextResponse) return principal;

  // Admins see admin events; an agent only sees events addressed to them.
  const keys = principal.kind === "admin" ? ["admin"] : [`agent:${principal.agent.id}`];
  const allowed = (audience: string[]) => audience.some((a) => keys.includes(a));

  const lastEventId =
    request.headers.get("last-event-id") || new URL(request.url).searchParams.get("lastEventId") || "";

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup();
        }
      };
      const sendMessage = (m: RealtimeMessage) => send(`${m.id ? `id: ${m.id}\n` : ""}data: ${JSON.stringify(m)}\n\n`);

      // Hold live events until the replay has been written so order is kept.
      let replaying = true;
      const held: RealtimeMessage[] = [];
      const unsubscribe = realtimeBroadcaster.subscribe((message, audience) => {
        if (!allowed(audience)) return;
        if (replaying) held.push(message);
        else sendMessage(message);
      });

      const heartbeat = setInterval(() => send(`: heartbeat\n\n`), HEARTBEAT_MS);
      const lifetime = setTimeout(() => {
        cleanup();
        try {
          controller.close();
        } catch {}
      }, STREAM_LIFETIME_MS);

      cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
        clearTimeout(lifetime);
      };
      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });

      send(`retry: 3000\n\n`);
      const at = new Date().toISOString();
      try {
        if (/^\d+$/.test(lastEventId)) {
          const { events, complete } = await realtimeBroadcaster.replaySince(Number(lastEventId));
          for (const e of events) if (allowed(e.audience)) sendMessage(e.message);
          if (!complete) sendMessage({ type: RealtimeEvent.RESYNC, at });
          sendMessage({ type: RealtimeEvent.CONNECTED, at, payload: { replayed: complete } });
        } else {
          const end = await realtimeBroadcaster.logEnd();
          sendMessage({ id: String(end), type: RealtimeEvent.CONNECTED, at, payload: { replayed: false } });
        }
      } catch (err: any) {
        console.warn("[SSE] Could not read the event log on connect:", err.message);
        sendMessage({ type: RealtimeEvent.RESYNC, at });
        sendMessage({ type: RealtimeEvent.CONNECTED, at, payload: { replayed: false } });
      }

      replaying = false;
      for (const m of held) sendMessage(m);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
