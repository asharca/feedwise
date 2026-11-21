import { expect, it, vi } from "vitest";
import { ingestFeed, type IngestDeps } from "@/lib/feeds/ingest";
import { FeedError } from "@/lib/feeds/feed-error";
import { parseFeed } from "@/lib/feeds/parser";

const url = "https://example.org/feed";
const response = {
  url,
  etag: "v2",
  contentType: "application/xml",
  lastModified: null,
  maxAgeMs: 0,
  body: '<rss version="2.0"><channel><title>Feed</title><item><title>One</title></item><item><title>Two</title></item></channel></rss>',
};

function setup() {
  return {
    load: vi.fn(async () => ({
      url,
      sourceType: "rss" as const,
      sourceConfig: null,
      etag: "v1",
      lastModified: null,
    })),
    fetch: vi.fn<IngestDeps["fetch"]>(async () => response),
    parse: vi.fn(parseFeed),
    save: vi.fn<IngestDeps["save"]>(async () => ["new-1"]),
    saveFailure: vi.fn(async () => {}),
    getSubscribers: vi.fn(async () => [
      { userId: "u1", fetchFullText: false },
      { userId: "u2", fetchFullText: true },
    ]),
    publish: vi.fn(async () => {}),
    applyRules: vi.fn(async () => {}),
    enqueueFullText: vi.fn(async () => {}),
  } satisfies IngestDeps;
}

it("counts only inserted ids, invokes rules and enqueues once per article after commit", async () => {
  const d = setup();
  expect(await ingestFeed("f", d)).toEqual({ articleCount: 1 });
  expect(d.parse.mock.results[0].value.articles).toHaveLength(2);
  expect(d.applyRules).toHaveBeenCalledWith("f", ["new-1"]);
  expect(d.applyRules.mock.invocationCallOrder[0]).toBeGreaterThan(
    d.save.mock.invocationCallOrder[0],
  );
  expect(d.enqueueFullText).toHaveBeenCalledExactlyOnceWith("new-1");
  expect(d.publish).toHaveBeenCalledTimes(2);
  expect(d.publish).toHaveBeenCalledWith("u2", { type: "articles.new", feedId: "f", count: 1 });
});

it.each([true, false])(
  "publishes only feed.fetched for zero inserts (not modified: %s)",
  async (notModified) => {
    const d = setup();
    d.save.mockResolvedValue([]);
    if (notModified) d.fetch.mockResolvedValue({ ...response, body: null });
    expect(await ingestFeed("f", d)).toEqual({ articleCount: 0 });
    expect(d.parse).toHaveBeenCalledTimes(notModified ? 0 : 1);
    expect(d.save).toHaveBeenCalledWith(
      "f",
      url,
      expect.anything(),
      notModified ? null : expect.anything(),
    );
    expect(d.publish).toHaveBeenCalledTimes(2);
    for (const user of ["u1", "u2"])
      expect(d.publish).toHaveBeenCalledWith(user, { type: "feed.fetched", feedId: "f" });
    expect(d.applyRules).not.toHaveBeenCalled();
    expect(d.enqueueFullText).not.toHaveBeenCalled();
  },
);

it("records classified failures without storing articles or validators", async () => {
  const d = setup();
  d.fetch.mockRejectedValue(new FeedError("timeout", "late"));
  await expect(ingestFeed("f", d)).rejects.toMatchObject({ code: "timeout" });
  expect(d.saveFailure).toHaveBeenCalledWith(
    "f",
    url,
    expect.objectContaining({ code: "timeout" }),
  );
  expect(d.save).not.toHaveBeenCalled();
  expect(d.publish).toHaveBeenCalledWith("u1", expect.objectContaining({ type: "feed.error" }));
});
