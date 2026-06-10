import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { articles, feeds, subscriptions } from "@/lib/db/schema";
import { callChatCompletion, withLlmRetry } from "@/lib/digest/llm-client";
import type { LlmConfig } from "@/lib/digest/llm-config";

const ARTICLE_POOL_SIZE = 60;
const SEARCH_WINDOW_DAYS = 30;

export interface PooledArticle {
  id: string;
  title: string | null;
  feedTitle: string | null;
  url: string | null;
  summary: string | null;
}

export interface AiSearchAnswer {
  answer: string;
  articles: Array<{
    id: string;
    title: string | null;
    feedTitle: string | null;
    url: string | null;
    summary: string | null;
  }>;
}

export function buildArticleListBlock(pool: PooledArticle[]): string {
  return pool
    .map(
      (a, i) =>
        `[${i}] ${a.title ?? "(no title)"} (${a.feedTitle ?? ""})\n    ${(a.summary ?? "").slice(0, 240)}`,
    )
    .join("\n");
}

export function parseAiSearchResponse(response: unknown, pool: PooledArticle[]): AiSearchAnswer {
  const typed = response as { answer?: unknown; indices?: unknown };
  const answer = typeof typed.answer === "string" ? typed.answer : "";
  const indices = Array.isArray(typed.indices)
    ? typed.indices.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < pool.length)
    : [];
  return {
    answer,
    articles: indices.map((i) => ({
      id: pool[i].id,
      title: pool[i].title,
      feedTitle: pool[i].feedTitle,
      url: pool[i].url,
      summary: pool[i].summary,
    })),
  };
}

/** Answer a question about the user's recent articles via their LLM. */
export async function aiSearchArticles(
  userId: string,
  query: string,
  llmConfig: LlmConfig,
  chat: typeof callChatCompletion = callChatCompletion,
): Promise<AiSearchAnswer & { pool: number }> {
  const since = new Date(Date.now() - SEARCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const pool: PooledArticle[] = await db
    .select({
      id: articles.id,
      title: articles.title,
      summary: articles.summary,
      feedTitle: feeds.title,
      url: articles.url,
    })
    .from(articles)
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .innerJoin(
      subscriptions,
      and(eq(subscriptions.feedId, feeds.id), eq(subscriptions.userId, userId)),
    )
    .where(gte(articles.createdAt, since))
    .orderBy(desc(articles.createdAt))
    .limit(ARTICLE_POOL_SIZE);

  if (pool.length === 0) {
    return { answer: "No recent articles to search.", articles: [], pool: 0 };
  }

  const response = await withLlmRetry(() =>
    chat(llmConfig, {
      system:
        "You answer questions about a user's news feed by referencing a list of recent articles. " +
        'Reply with JSON: { "answer": string, "indices": number[] }. ' +
        "Pick at most 5 article indices (by [N] number) that are relevant. " +
        "If no article is relevant, return an empty indices array and say so in answer. " +
        "Keep answer concise (max 4 sentences). Do not invent facts not in the articles.",
      user: `Question: ${query}\n\nRecent articles:\n${buildArticleListBlock(pool)}`,
      jsonSchema: {
        name: "ai_search",
        schema: {
          type: "object",
          properties: {
            answer: { type: "string" },
            indices: { type: "array", items: { type: "integer", minimum: 0 }, maxItems: 5 },
          },
          required: ["answer", "indices"],
        },
      },
    }),
  );

  return { ...parseAiSearchResponse(response, pool), pool: pool.length };
}
