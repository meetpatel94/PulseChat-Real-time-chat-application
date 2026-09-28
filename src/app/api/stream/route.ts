import { NextRequest } from "next/server";
import { chatBus } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/**
 * Server-sent-events stream for the sandbox demo.
 * The client opens one stream per browser tab and receives
 * { event, data } frames: "message", "online_users" and "typing".
 */
export async function GET(req: NextRequest) {
  const username = (req.nextUrl.searchParams.get("username") ?? "").trim();
  if (!username || username.length > 30) {
    return Response.json(
      { success: false, error: "Invalid username" },
      { status: 400 }
    );
  }

  const clientId = crypto.randomUUID();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const send = (payload: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // stream already closed
        }
      };

      chatBus.join(username, clientId);
      send({ event: "online_users", data: chatBus.onlineNames });

      const off = chatBus.onChat((e) => {
        if (e.event === "typing" && e.data.username === username) return;
        send(e);
      });

      const ping = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          // stream already closed
        }
      }, 25000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        off();
        chatBus.leave(username, clientId);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      req.signal.addEventListener("abort", cleanup);
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
