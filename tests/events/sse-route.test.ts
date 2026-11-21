import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(async () => ({ user: { id: "user" } })),
}));
vi.mock("@/lib/events/subscriber", () => ({ subscribeUserEvents: vi.fn() }));
import { subscribeUserEvents } from "@/lib/events/subscriber";
import { GET } from "@/app/api/sse/route";

const unsubscribe = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(subscribeUserEvents).mockReturnValue(unsubscribe);
});
afterEach(() => vi.useRealTimers());

describe("SSE route", () => {
  it("streams user messages and heartbeats and releases the subscription on abort", async () => {
    const ac = new AbortController();
    const res = await GET(new Request("https://test.local/api/sse", { signal: ac.signal }), {
      params: Promise.resolve({}),
    });
    const reader = res.body!.getReader();
    const [[user, listener]] = vi.mocked(subscribeUserEvents).mock.calls;
    expect(user).toBe("user");
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    listener('{"type":"article.updated","articleId":"1"}');
    expect(new TextDecoder().decode((await reader.read()).value)).toBe(
      'data: {"type":"article.updated","articleId":"1"}\n\n',
    );
    vi.advanceTimersByTime(30_000);
    expect(new TextDecoder().decode((await reader.read()).value)).toBe(": heartbeat\n\n");
    ac.abort();
    expect((await reader.read()).done).toBe(true);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("releases the subscription on cancellation without waiting for an abort", async () => {
    const ac = new AbortController();
    const res = await GET(new Request("https://test.local/api/sse", { signal: ac.signal }), {
      params: Promise.resolve({}),
    });
    await res.body!.cancel();
    ac.abort();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
