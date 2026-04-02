import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { validateApiToken } from "@/lib/db/queries/api-tokens";
import {
  getArticles,
  getArticleById,
  searchArticles,
  getTodayArticles,
  markArticle,
} from "@/lib/db/queries/articles";
import {
  getSubscriptions,
  subscribeFeed,
  unsubscribeFeed,
} from "@/lib/db/queries/feeds";

function buildMcpServer(userId: string): McpServer {
  const server = new McpServer({ name: "feedwise", version: "0.1.0" });

  server.tool("list_subscriptions", "List all RSS feed subscriptions", {}, async () => {
    const subs = await getSubscriptions(userId);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(
          subs.map((s) => ({
            id: s.id, feedId: s.feedId,
            title: s.title ?? s.feedTitle, url: s.url,
            iconUrl: s.iconUrl, siteUrl: s.siteUrl,
          })),
          null, 2
        ),
      }],
    };
  });

  server.tool(
    "list_articles",
    "List articles with optional filters",
    {
      feedId: z.string().uuid().optional().describe("Filter by feed ID"),
      unread: z.boolean().optional().describe("Only unread articles"),
      starred: z.boolean().optional().describe("Only starred articles"),
      since: z.string().optional().describe("ISO date — only articles published after this date"),
      search: z.string().optional().describe("Search in title and content"),
      limit: z.number().int().min(1).max(200).optional().describe("Max results (default 50)"),
      offset: z.number().int().min(0).optional().describe("Pagination offset"),
    },
    async ({ feedId, unread, starred, since, search, limit, offset }) => {
      const rows = await getArticles(userId, {
        feedId, unreadOnly: unread, starredOnly: starred,
        since: since ? new Date(since) : undefined,
        search, limit, offset,
      });
      return {
        content: [{
          type: "text",
          text: JSON.stringify(
            rows.map((a) => ({
              id: a.id, feedTitle: a.feedTitle, title: a.title,
              summary: a.summary?.slice(0, 200),
              publishedAt: a.publishedAt, isRead: a.isRead,
              isStarred: a.isStarred, url: a.url,
            })),
            null, 2
          ),
        }],
      };
    }
  );

  server.tool(
    "get_article",
    "Get full article content by ID",
    { articleId: z.string().uuid().describe("Article ID") },
    async ({ articleId }) => {
      const article = await getArticleById(userId, articleId);
      if (!article) {
        return { content: [{ type: "text", text: "Article not found" }], isError: true };
      }
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            id: article.id, feedTitle: article.feedTitle, title: article.title,
            author: article.author, url: article.url,
            publishedAt: article.publishedAt, isRead: article.isRead,
            isStarred: article.isStarred, contentHtml: article.contentHtml,
            summary: article.summary,
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    "search_articles",
    "Full-text search across article titles and content",
    {
      query: z.string().min(1).describe("Search query"),
      limit: z.number().int().min(1).max(100).optional().describe("Max results (default 20)"),
    },
    async ({ query, limit }) => {
      const rows = await searchArticles(userId, query, limit);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(
            rows.map((a) => ({
              id: a.id, feedTitle: a.feedTitle, title: a.title,
              summary: a.summary?.slice(0, 200),
              publishedAt: a.publishedAt, url: a.url,
            })),
            null, 2
          ),
        }],
      };
    }
  );

  server.tool("get_today_digest", "Get a digest of today's articles grouped by feed", {}, async () => {
    const rows = await getTodayArticles(userId);
    const byFeed: Record<string, { feedTitle: string; articles: { title: string | null; url: string | null; publishedAt: Date | null }[] }> = {};
    for (const a of rows) {
      if (!byFeed[a.feedId]) {
        byFeed[a.feedId] = { feedTitle: a.feedTitle ?? "Unknown", articles: [] };
      }
      byFeed[a.feedId].articles.push({ title: a.title, url: a.url, publishedAt: a.publishedAt });
    }
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          date: new Date().toISOString().slice(0, 10),
          totalArticles: rows.length,
          feeds: Object.values(byFeed),
        }, null, 2),
      }],
    };
  });

  server.tool(
    "mark_article_read",
    "Mark an article as read or unread",
    {
      articleId: z.string().uuid().describe("Article ID"),
      read: z.boolean().optional().default(true).describe("true=read, false=unread"),
    },
    async ({ articleId, read }) => {
      await markArticle(userId, articleId, { isRead: read });
      return { content: [{ type: "text", text: `Article marked as ${read ? "read" : "unread"}` }] };
    }
  );

  server.tool(
    "mark_article_starred",
    "Star or unstar an article",
    {
      articleId: z.string().uuid().describe("Article ID"),
      starred: z.boolean().optional().default(true).describe("true=star, false=unstar"),
    },
    async ({ articleId, starred }) => {
      await markArticle(userId, articleId, { isStarred: starred });
      return { content: [{ type: "text", text: `Article ${starred ? "starred" : "unstarred"}` }] };
    }
  );

  server.tool(
    "add_subscription",
    "Subscribe to a new RSS feed",
    { url: z.string().url().describe("Feed URL") },
    async ({ url }) => {
      const result = await subscribeFeed(userId, url);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ message: "Subscribed successfully", ...result }, null, 2),
        }],
      };
    }
  );

  server.tool(
    "remove_subscription",
    "Unsubscribe from an RSS feed",
    { subscriptionId: z.string().uuid().describe("Subscription ID (from list_subscriptions)") },
    async ({ subscriptionId }) => {
      await unsubscribeFeed(userId, subscriptionId);
      return { content: [{ type: "text", text: "Unsubscribed successfully" }] };
    }
  );

  return server;
}

function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}

async function handler(req: Request): Promise<Response> {
  const token = extractBearerToken(req);
  if (!token) {
    return new Response(
      JSON.stringify({ error: "Missing Bearer token" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const userId = await validateApiToken(token);
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "Invalid or expired token" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — works with Next.js serverless
    enableJsonResponse: true,
  });

  const server = buildMcpServer(userId);
  await server.connect(transport);

  return transport.handleRequest(req);
}

export { handler as GET, handler as POST, handler as DELETE };
