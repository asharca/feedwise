import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/with-auth";
import { db } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getArticleById } from "@/lib/db/queries/articles";
import { getUserLlmConfig } from "@/lib/digest/llm-config";
import { generateTagsForArticle } from "@/lib/articles/enrichment";

export const POST = withAuth(async (_req, session, ctx) => {
  const { id } = await ctx.params;
  const article = await getArticleById(session.user.id, id);
  if (!article) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const llmConfig = await getUserLlmConfig(session.user.id);
  if (!llmConfig) {
    return NextResponse.json(
      { success: false, error: "No LLM configured — set one in Settings → Smart Digest" },
      { status: 400 },
    );
  }

  const userTags = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(eq(tags.userId, session.user.id));

  try {
    const suggestions = await generateTagsForArticle(article, userTags, llmConfig);
    return NextResponse.json({ success: true, data: { suggestions } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "LLM call failed";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
});
