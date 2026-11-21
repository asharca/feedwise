// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyRulesToNewArticles, applyRulesToNewHotItems } from "@/lib/rules/apply";
import * as queries from "@/lib/db/queries/rules";
import { enqueueNotification } from "@/lib/jobs/queues/notify";
import { enqueueFullText } from "@/lib/jobs/queues/fulltext";
import type { rules } from "@/lib/db/schema";

vi.mock("@/lib/db/queries/rules", () => ({
  subscriberRules: vi.fn(),
  newArticleSubjects: vi.fn(),
  writeArticleActions: vi.fn(),
  enabledHotRules: vi.fn(),
  claimHotHits: vi.fn(),
}));
vi.mock("@/lib/jobs/queues/fulltext", () => ({ enqueueFullText: vi.fn() }));
vi.mock("@/lib/jobs/queues/notify", () => ({ enqueueNotification: vi.fn() }));
const rule: typeof rules.$inferSelect = {
  id: "r",
  userId: "u",
  scope: "hot",
  name: "today",
  enabled: true,
  position: 0,
  matchMode: "all",
  conditions: [{ field: "hotSource", op: "equals", value: "source" }],
  actions: [{ type: "notify", channelIds: ["c"] }],
  updatedAt: new Date(),
  createdAt: new Date(),
};
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("ingest integration", () => {
  it("notifies only hot items whose DB claim succeeded", async () => {
    vi.mocked(queries.enabledHotRules).mockResolvedValue([rule]);
    vi.mocked(queries.claimHotHits).mockResolvedValue([{ id: "new" }]);
    const items = ["seen", "new", "new", "other"].map((id) => ({
      id,
      sourceKey: id === "other" ? "ignored" : "source",
      title: id,
      url: `https://news.example/${id}`,
      desc: null,
    }));
    await applyRulesToNewHotItems(items);
    expect(queries.claimHotHits).toHaveBeenCalledWith("r", ["seen", "new"]);
    expect(enqueueNotification).toHaveBeenCalledExactlyOnceWith({
      userId: "u",
      channelId: "c",
      message: { title: "new", body: "new", url: items[1].url, source: "today" },
    });
  });

  it("does not send when no claim is returned", async () => {
    vi.mocked(queries.enabledHotRules).mockResolvedValue([rule]);
    vi.mocked(queries.claimHotHits).mockResolvedValue([]);
    await applyRulesToNewHotItems([
      { id: "seen", sourceKey: "source", title: "t", url: "https://news.example", desc: null },
    ]);
    expect(enqueueNotification).not.toHaveBeenCalled();
  });

  it("passes matching persisted IDs to the article state writer and full-text queue", async () => {
    vi.mocked(queries.subscriberRules).mockResolvedValue([
      {
        folderId: "f",
        rule: {
          ...rule,
          scope: "article",
          conditions: [{ field: "folderId", op: "equals", value: "f" }],
          actions: [{ type: "fetchFullText" }, { type: "hide" }],
        },
      },
    ]);
    vi.mocked(queries.newArticleSubjects).mockResolvedValue([
      { id: "a", title: "t", url: null, content: "", author: null, feedId: "feed" },
    ]);
    await applyRulesToNewArticles("feed", ["a"]);
    expect(queries.newArticleSubjects).toHaveBeenCalledWith("feed", ["a"]);
    expect(queries.writeArticleActions).toHaveBeenCalledWith(
      [{ userId: "u", articleId: "a", read: false, star: false, hide: true }],
      [],
    );
    expect(enqueueFullText).toHaveBeenCalledExactlyOnceWith("a");
  });

  it("never propagates DB and queue errors to ingest", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(queries.subscriberRules).mockRejectedValue(new Error("DB unavailable"));
    await expect(applyRulesToNewArticles("feed", ["a"])).resolves.toBeUndefined();
    vi.mocked(queries.enabledHotRules).mockResolvedValue([rule]);
    vi.mocked(queries.claimHotHits).mockResolvedValue([{ id: "a" }]);
    vi.mocked(enqueueNotification).mockRejectedValue(new Error("Redis unavailable"));
    await expect(
      applyRulesToNewHotItems([
        { id: "a", title: "a", sourceKey: "source", url: "https://example.org/", desc: null },
      ]),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(2);
  });
});
