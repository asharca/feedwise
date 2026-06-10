import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { articles, feeds, subscriptions } from "@/lib/db/schema";
import { and, desc, eq, gte } from "drizzle-orm";
import { getUserLlmConfig } from "@/lib/digest/llm-config";
import { callChatCompletion, withLlmRetry } from "@/lib/digest/llm-client";

const SearchSchema = z.object({
  query: z.string().min(2).max(500),
});

const ARTICLE_POOL_SIZE = 60;
const SEARCH_WINDOW_DAYS = 30;

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = SearchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 400 });
  }
  const { query } = parsed.data;

  let llmConfig;
  try {
    llmConfig = await getUserLlmConfig(session.user.id);
  } catch {
    return NextResponse.json(
      { success: false, error: "LLM key could not be decrypted" },
      { status: 500 },
    );
  }
  if (!llmConfig) {
    return NextResponse.json(
      { success: false, error: "No LLM configured — set one in Settings → Smart Digest" },
      { status: 400 },
    );
  }

  const since = new Date(Date.now() - SEARCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const pool = await db
    .select({
      id: articles.id,
      title: articles.title,
      summary: articles.summary,
      feedTitle: feeds.title,
      publishedAt: articles.publishedAt,
      url: articles.url,
    })
    .from(articles)
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .innerJoin(
      subscriptions,
      and(eq(subscriptions.feedId, feeds.id), eq(subscriptions.userId, session.user.id)),
    )
    .where(gte(articles.createdAt, since))
    .orderBy(desc(articles.createdAt))
    .limit(ARTICLE_POOL_SIZE);

  if (pool.length === 0) {
    return NextResponse.json({
      success: true,
      data: { answer: "No recent articles to search.", articles: [] },
    });
  }

  const pooled = pool.map((a, i) => ({
    idx: i,
    id: a.id,
    title: a.title ?? "(no title)",
    feedTitle: a.feedTitle ?? "",
    summary: (a.summary ?? "").slice(0, 240),
  }));

  const articleListBlock = pooled
    .map((a) => `[${a.idx}] ${a.title} (${a.feedTitle})\n    ${a.summary}`)
    .join("\n");

  try {
    const response = (await withLlmRetry(() =>
      callChatCompletion(llmConfig, {
        system:
          "You answer questions about a user's news feed by referencing a list of recent articles. " +
          'Reply with JSON: { "answer": string, "indices": number[] }. ' +
          "Pick at most 5 article indices (by [N] number) that are relevant. " +
          "If no article is relevant, return an empty indices array and say so in answer. " +
          "Keep answer concise (max 4 sentences). Do not invent facts not in the articles.",
        user: `Question: ${query}\n\nRecent articles:\n${articleListBlock}`,
        jsonSchema: {
          name: "ai_search",
          schema: {
            type: "object",
            properties: {
              answer: { type: "string" },
              indices: {
                type: "array",
                items: { type: "integer", minimum: 0 },
                maxItems: 5,
              },
            },
            required: ["answer", "indices"],
          },
        },
      }),
    )) as { answer?: unknown; indices?: unknown };

    const answer = typeof response.answer === "string" ? response.answer : "";
    const indices = Array.isArray(response.indices)
      ? response.indices.filter(
          (n): n is number => Number.isInteger(n) && n >= 0 && n < pool.length,
        )
      : [];

    const cited = indices.map((i) => ({
      id: pool[i].id,
      title: pool[i].title,
      feedTitle: pool[i].feedTitle,
      url: pool[i].url,
      summary: pool[i].summary,
    }));

    return NextResponse.json({
      success: true,
      data: { answer, articles: cited, pool: pool.length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "LLM call failed";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
