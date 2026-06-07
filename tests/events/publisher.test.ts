import { describe, it, expect, vi, beforeEach } from "vitest";
import { publishEvent } from "@/lib/events/publisher";

const { publishMock } = vi.hoisted(() => ({
  publishMock: vi.fn().mockResolvedValue(1),
}));

vi.mock("ioredis", () => ({
  default: class MockIORedis {
    publish = publishMock;
  },
}));

describe("publishEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publishMock.mockResolvedValue(1);
  });

  it("publishes a JSON-serialised event to feedwise:events:{userId}", async () => {
    await publishEvent("user-123", { type: "articles.new", feedId: "feed-abc", count: 5 });

    expect(publishMock).toHaveBeenCalledWith(
      "feedwise:events:user-123",
      JSON.stringify({ type: "articles.new", feedId: "feed-abc", count: 5 }),
    );
  });

  it("does not throw if Redis publish fails", async () => {
    publishMock.mockRejectedValueOnce(new Error("connection lost"));

    await expect(
      publishEvent("user-123", { type: "feed.fetched", feedId: "feed-abc" }),
    ).resolves.toBeUndefined();
  });
});
