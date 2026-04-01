import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
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

async function resolveUserId(): Promise<string> {
  const email = process.env.FEEDWISE_USER_EMAIL;
  if (email) {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    if (user) return user.id;
    throw new Error(`User not found: ${email}`);
  }
  // Fallback: first user
  const [user] = await db.select({ id: users.id }).from(users).limit(1);
  if (user) return user.id;
  throw new Error("No users found. Set FEEDWISE_USER_EMAIL in env.");
}

const server = new McpServer({
  name: "feedwise",
  version: "0.1.0",
});

let cachedUserId: string | null = null;
async function getUserId(): Promise<string> {
  if (!cachedUserId) cachedUserId = await resolveUserId();
  return cachedUserId;
}

// ─── Tools ───────────────────────────────────────────────────

server.tool(
  "list_subscriptions",
  "List all RSS feed subscriptions",
  {},
  async () => {
    const userId = await getUserId();
    const subs = await getSubscriptions(userId);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            subs.map((s) => ({
              id: s.id,
              feedId: s.feedId,
              title: s.title ?? s.feedTitle,
              url: s.url,
              iconUrl: s.iconUrl,
              siteUrl: s.siteUrl,
            })),
            null,
            2
          ),
        },
      ],
    };
  }
);

server.tool(
  "list_articles",
  "List articles with optional filters",
  {
    feedId: z.string().uuid().optional().describe("Filter by feed ID"),
    unread: z.boolean().optional().describe("Only unread articles"),
    starred: z.boolean().optional().describe("Only starred articles"),
    since: z
      .string()
      .optional()
      .describe("ISO date string — only articles published after this date"),
    search: z.string().optional().describe("Search in title and content"),
    limit: z.number().int().min(1).max(200).optional().describe("Max results (default 50)"),
    offset: z.number().int().min(0).optional().describe("Pagination offset"),
  },
  async ({ feedId, unread, starred, since, search, limit, offset }) => {
    const userId = await getUserId();
    const rows = await getArticles(userId, {
      feedId,
      unreadOnly: unread,
      starredOnly: starred,
      since: since ? new Date(since) : undefined,
      search,
      limit,
      offset,
    });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            rows.map((a) => ({
              id: a.id,
              feedTitle: a.feedTitle,
              title: a.title,
              summary: a.summary?.slice(0, 200),
              publishedAt: a.publishedAt,
              isRead: a.isRead,
              isStarred: a.isStarred,
              url: a.url,
            })),
            null,
            2
          ),
        },
      ],
    };
  }
);

server.tool(
  "get_article",
  "Get full article content by ID",
  {
    articleId: z.string().uuid().describe("Article ID"),
  },
  async ({ articleId }) => {
    const userId = await getUserId();
    const article = await getArticleById(userId, articleId);
    if (!article) {
      return { content: [{ type: "text", text: "Article not found" }], isError: true };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              id: article.id,
              feedTitle: article.feedTitle,
              title: article.title,
              author: article.author,
              url: article.url,
              publishedAt: article.publishedAt,
              isRead: article.isRead,
              isStarred: article.isStarred,
              contentHtml: article.contentHtml,
              summary: article.summary,
            },
            null,
            2
          ),
        },
      ],
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
    const userId = await getUserId();
    const rows = await searchArticles(userId, query, limit);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            rows.map((a) => ({
              id: a.id,
              feedTitle: a.feedTitle,
              title: a.title,
              summary: a.summary?.slice(0, 200),
              publishedAt: a.publishedAt,
              url: a.url,
            })),
            null,
            2
          ),
        },
      ],
    };
  }
);

server.tool(
  "get_today_digest",
  "Get a digest of today's articles grouped by feed",
  {},
  async () => {
    const userId = await getUserId();
    const rows = await getTodayArticles(userId);

    // Group by feed
    const byFeed: Record<string, { feedTitle: string; articles: { title: string | null; url: string | null; publishedAt: Date | null }[] }> = {};
    for (const a of rows) {
      const key = a.feedId;
      if (!byFeed[key]) {
        byFeed[key] = { feedTitle: a.feedTitle ?? "Unknown", articles: [] };
      }
      byFeed[key].articles.push({
        title: a.title,
        url: a.url,
        publishedAt: a.publishedAt,
      });
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              date: new Date().toISOString().slice(0, 10),
              totalArticles: rows.length,
              feeds: Object.values(byFeed),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.tool(
  "mark_article_read",
  "Mark an article as read or unread",
  {
    articleId: z.string().uuid().describe("Article ID"),
    read: z.boolean().optional().default(true).describe("true=read, false=unread"),
  },
  async ({ articleId, read }) => {
    const userId = await getUserId();
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
    const userId = await getUserId();
    await markArticle(userId, articleId, { isStarred: starred });
    return { content: [{ type: "text", text: `Article ${starred ? "starred" : "unstarred"}` }] };
  }
);

server.tool(
  "add_subscription",
  "Subscribe to a new RSS feed",
  {
    url: z.string().url().describe("Feed URL"),
  },
  async ({ url }) => {
    const userId = await getUserId();
    const result = await subscribeFeed(userId, url);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { message: "Subscribed successfully", ...result },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.tool(
  "remove_subscription",
  "Unsubscribe from an RSS feed",
  {
    subscriptionId: z.string().uuid().describe("Subscription ID (from list_subscriptions)"),
  },
  async ({ subscriptionId }) => {
    const userId = await getUserId();
    await unsubscribeFeed(userId, subscriptionId);
    return { content: [{ type: "text", text: "Unsubscribed successfully" }] };
  }
);

// ─── Start ───────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server failed to start:", err);
  process.exit(1);
});
