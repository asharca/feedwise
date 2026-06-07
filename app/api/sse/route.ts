// app/api/sse/route.ts
import IORedis from "ioredis";
import { requireSession } from "@/lib/auth/session";

const HEARTBEAT_INTERVAL_MS = 30_000;
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export async function GET(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;
  const channel = `feedwise:events:${userId}`;

  const sub = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let cleaned = false;

  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    sub.unsubscribe(channel).then(() => sub.disconnect()).catch(() => sub.disconnect());
  }

  const stream = new ReadableStream({
    start(controller) {
      function enqueue(chunk: string) {
        try {
          controller.enqueue(new TextEncoder().encode(chunk));
        } catch {
          // controller already closed
        }
      }

      sub.subscribe(channel, (err) => {
        if (err) {
          console.error("[sse] subscribe error:", err);
          controller.close();
          cleanup();
        }
      });

      sub.on("message", (_ch: string, message: string) => {
        enqueue(`data: ${message}\n\n`);
      });

      sub.on("error", (err) => {
        console.error("[sse] Redis error:", err);
        controller.close();
        cleanup();
      });

      heartbeatTimer = setInterval(() => {
        enqueue(`: heartbeat\n\n`);
      }, HEARTBEAT_INTERVAL_MS);
    },
    cancel() {
      cleanup();
    },
  });

  req.signal.addEventListener("abort", cleanup);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
