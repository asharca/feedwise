import { withAuth } from "@/lib/api/with-auth";
import { subscribeUserEvents } from "@/lib/events/subscriber";

const HEARTBEAT_INTERVAL_MS = 30_000;

export const GET = withAuth(async (req, session) => {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const abort = () => {
        cleanup();
        controller.close();
      };
      if (req.signal.aborted) {
        controller.close();
        return;
      }
      const unsubscribe = subscribeUserEvents(
        session.user.id,
        (message) => controller.enqueue(encoder.encode(`data: ${message}\n\n`)),
        (error) => {
          cleanup();
          controller.error(error);
        },
      );
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, HEARTBEAT_INTERVAL_MS);
      cleanup = () => {
        req.signal.removeEventListener("abort", abort);
        clearInterval(heartbeat);
        unsubscribe();
      };
      req.signal.addEventListener("abort", abort, { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
