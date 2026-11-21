import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type * as queries from "@/lib/db/queries/mcp";
import type { getHotBoards } from "@/lib/hot/boards";
import type { HotTrending } from "@/lib/hot/types";
import { CONTENT_VIEWS } from "@/lib/db/schema-types";
import { assertFetchableUrl } from "@/lib/net/safe-fetch";
import { htmlToText } from "@/lib/utils";

export type ToolQueries = Omit<typeof queries, "userIdForEmail"> & {
  hotBoards: typeof getHotBoards;
  hotTrending: () => Promise<HotTrending>;
};
const limit = z.number().int().min(1).max(100).default(20);
const id = z.string().uuid();
const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});
const error = (message: string) => ({
  isError: true,
  content: [{ type: "text" as const, text: message }],
});

// Never expose underlying database errors (which may contain SQL or bind parameters).
async function result(work: Promise<unknown>) {
  try {
    return text(await work);
  } catch (cause) {
    console.error("[mcp] Tool failed", cause);
    return error("工具执行失败");
  }
}

export function createToolServer(userId: string, q: ToolQueries) {
  const server = new McpServer({ name: "feedwise", version: "0.1.0" });
  server.registerTool(
    "search_articles",
    {
      description: "Search articles in your subscriptions.",
      inputSchema: { query: z.string().trim().min(1).max(500), limit },
    },
    ({ query, limit }) => result(q.searchArticles(userId, query, limit)),
  );
  server.registerTool(
    "list_articles",
    {
      description: "List your articles, newest first.",
      inputSchema: {
        unread_only: z.boolean().optional(),
        starred_only: z.boolean().optional(),
        feed_id: id.optional(),
        view: z.enum(CONTENT_VIEWS).optional(),
        limit,
      },
    },
    (filters) => result(q.listArticles(userId, filters)),
  );
  server.registerTool(
    "get_article",
    { description: "Read a subscribed article as plain text.", inputSchema: { id } },
    async ({ id }) => {
      const article = await q.getArticle(userId, id).catch((cause) => {
        console.error("[mcp] Article lookup failed", cause);
        return undefined;
      });
      if (!article) return error(article === null ? "未找到文章" : "工具执行失败");
      const { fullContentHtml, contentHtml, contentText, ...metadata } = article;
      return text({
        ...metadata,
        content:
          htmlToText(fullContentHtml ?? "") ||
          contentText ||
          htmlToText(contentHtml ?? "") ||
          metadata.summary ||
          "",
      });
    },
  );
  server.registerTool(
    "mark_articles",
    {
      description: "Change read or starred state for visible articles.",
      inputSchema: {
        ids: z.array(id).min(1).max(100),
        read: z.boolean().optional(),
        starred: z.boolean().optional(),
      },
    },
    ({ ids, read, starred }) =>
      read === undefined && starred === undefined
        ? error("请指定 read 或 starred")
        : result(q.markArticles(userId, ids, read, starred)),
  );
  server.registerTool(
    "list_feeds",
    { description: "List subscribed feeds and folder names.", inputSchema: {} },
    () => result(q.listFeeds(userId)),
  );
  server.registerTool(
    "subscribe_feed",
    {
      description: "Subscribe to a public feed; folder is an optional folder name.",
      inputSchema: { url: z.url().max(4096), folder: z.string().trim().min(1).max(255).optional() },
    },
    ({ url, folder }) => result(q.subscribeFeed(userId, assertFetchableUrl(url).href, folder)),
  );
  server.registerTool(
    "hot_boards",
    {
      description: "List public hot boards by category.",
      inputSchema: {
        category: z.enum(["all", "news", "tech", "community", "entertainment"]).optional(),
      },
    },
    ({ category }) => result(q.hotBoards(category)),
  );
  server.registerTool(
    "hot_trending",
    { description: "Show rising and cross-platform trends.", inputSchema: {} },
    () => result(q.hotTrending()),
  );
  server.registerTool(
    "related_coverage",
    {
      description: "Find similar coverage in your other subscriptions.",
      inputSchema: { article_id: id },
    },
    ({ article_id }) => result(q.relatedCoverage(userId, article_id)),
  );
  return server;
}
