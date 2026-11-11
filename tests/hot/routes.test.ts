// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/session", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/hot/boards", () => ({ getHotBoards: vi.fn(), computeHotTrending: vi.fn() }));
vi.mock("@/lib/jobs/queue", () => ({ enqueueHotFetch: vi.fn() }));
import { requireSession } from "@/lib/auth/session";
import { computeHotTrending, getHotBoards } from "@/lib/hot/boards";
import { enqueueHotFetch } from "@/lib/jobs/queue";
import { GET as getBoards } from "@/app/api/hot/route";
import { GET as getTrending } from "@/app/api/hot/trending/route";
import { POST as refresh } from "@/app/api/hot/[key]/refresh/route";

const context = { params: Promise.resolve({}) };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSession).mockResolvedValue({ user: { id: "u1" } } as never);
  vi.mocked(getHotBoards).mockResolvedValue([]);
  vi.mocked(computeHotTrending).mockReturnValue({ rising: [], crossPlatform: [] });
});

describe("hot API", () => {
  it("returns the boards envelope and validates categories", async () => {
    const response = await getBoards(
      new Request("https://test.local/api/hot?category=tech"),
      context,
    );
    expect(await response.json()).toEqual({ success: true, data: { boards: [] } });
    expect(getHotBoards).toHaveBeenCalledWith("tech");
    expect(
      (await getBoards(new Request("https://test.local/api/hot?category=invalid"), context)).status,
    ).toBe(400);
  });

  it("defaults to all categories and exposes the trending envelope", async () => {
    await getBoards(new Request("https://test.local/api/hot"), context);
    expect(getHotBoards).toHaveBeenCalledWith("all");
    const response = await getTrending(new Request("https://test.local/api/hot/trending"), context);
    expect(await response.json()).toEqual({
      success: true,
      data: { rising: [], crossPlatform: [] },
    });
  });

  it("queues a known source and returns 404 for unknown sources", async () => {
    const response = await refresh(
      new Request("https://test.local/api/hot/zhihu/refresh", { method: "POST" }),
      { params: Promise.resolve({ key: "zhihu" }) },
    );
    expect(await response.json()).toEqual({ success: true, data: { queued: true } });
    expect(enqueueHotFetch).toHaveBeenCalledExactlyOnceWith("zhihu");
    const unknown = await refresh(
      new Request("https://test.local/api/hot/unknown/refresh", { method: "POST" }),
      { params: Promise.resolve({ key: "unknown" }) },
    );
    expect(unknown.status).toBe(404);
    expect(enqueueHotFetch).toHaveBeenCalledTimes(1);
  });

  it("requires authentication for every endpoint", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("unauthenticated"));
    expect((await getBoards(new Request("https://test.local/api/hot"), context)).status).toBe(401);
    expect(
      (await getTrending(new Request("https://test.local/api/hot/trending"), context)).status,
    ).toBe(401);
    expect(
      (
        await refresh(new Request("https://test.local/api/hot/zhihu/refresh", { method: "POST" }), {
          params: Promise.resolve({ key: "zhihu" }),
        })
      ).status,
    ).toBe(401);
    expect(getHotBoards).not.toHaveBeenCalled();
    expect(enqueueHotFetch).not.toHaveBeenCalled();
  });
});
