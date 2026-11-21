// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createToolServer, type ToolQueries } from "@/lib/mcp/tools";

const id = "186b54ed-491f-4294-82cb-2ff7dcddc92c";
const queries = {
  listArticles: vi.fn().mockResolvedValue([]),
  searchArticles: vi.fn().mockResolvedValue([]),
  getArticle: vi.fn(),
  markArticles: vi.fn().mockResolvedValue({ updated: 1 }),
  listFeeds: vi.fn().mockResolvedValue([]),
  subscribeFeed: vi.fn().mockResolvedValue({ feedId: id }),
  relatedCoverage: vi.fn().mockResolvedValue([]),
  hotBoards: vi.fn().mockResolvedValue([]),
  hotTrending: vi.fn().mockResolvedValue({ rising: [], crossPlatform: [] }),
} satisfies ToolQueries;
let client: Client;
beforeEach(async () => {
  vi.clearAllMocks();
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "1" });
  await createToolServer("owner", queries).connect(b);
  await client.connect(a);
});
afterEach(async () => {
  await client.close();
});

it("registers all tools and binds private calls to the transport user, never an input user", async () => {
  const names = (await client.listTools()).tools.map((t) => t.name);
  expect(names.sort()).toEqual([
    "get_article",
    "hot_boards",
    "hot_trending",
    "list_articles",
    "list_feeds",
    "mark_articles",
    "related_coverage",
    "search_articles",
    "subscribe_feed",
  ]);
  for (const [name, args] of Object.entries({
    search_articles: { query: "  热搜  ", userId: "other" },
    list_articles: { view: "audio", feed_id: id, starred_only: true },
    mark_articles: { ids: [id], read: false },
    list_feeds: {},
    subscribe_feed: { url: "https://example.org/rss", folder: "新闻" },
    related_coverage: { article_id: id },
    hot_boards: { category: "tech" },
    hot_trending: {},
  })) {
    expect((await client.callTool({ name, arguments: args })).isError).not.toBe(true);
  }
  expect(queries.searchArticles).toHaveBeenCalledWith("owner", "热搜", 20);
  expect(queries.listArticles).toHaveBeenCalledWith("owner", {
    limit: 20,
    view: "audio",
    feed_id: id,
    starred_only: true,
  });
  expect(queries.markArticles).toHaveBeenCalledWith("owner", [id], false, undefined);
  expect(queries.listFeeds).toHaveBeenCalledWith("owner");
  expect(queries.subscribeFeed).toHaveBeenCalledWith("owner", "https://example.org/rss", "新闻");
  expect(queries.relatedCoverage).toHaveBeenCalledWith("owner", id);
  expect(queries.hotBoards).toHaveBeenCalledWith("tech");
  expect(queries.hotTrending).toHaveBeenCalledOnce();
});

it("prefers plain text from full HTML and never returns stored HTML", async () => {
  queries.getArticle.mockResolvedValueOnce({
    id,
    fullContentHtml: "<p>Full &amp; readable</p>",
    contentText: "short",
  });
  const response = await client.callTool({ name: "get_article", arguments: { id } });
  expect(queries.getArticle).toHaveBeenCalledWith("owner", id);
  expect(response.content).toEqual([
    { type: "text", text: JSON.stringify({ id, content: "Full & readable" }) },
  ]);
  queries.getArticle.mockResolvedValueOnce(null);
  expect((await client.callTool({ name: "get_article", arguments: { id } })).isError).toBe(true);
});

it("rejects oversized queries and empty mutations before touching the DB", async () => {
  for (const [name, args] of Object.entries({
    list_articles: { limit: 101 },
    mark_articles: { ids: [id] },
  })) {
    expect((await client.callTool({ name, arguments: args })).isError).toBe(true);
  }
  expect(queries.listArticles).not.toHaveBeenCalled();
  expect(queries.markArticles).not.toHaveBeenCalled();
});
