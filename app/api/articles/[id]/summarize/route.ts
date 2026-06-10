import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/with-auth";
import {
  getArticleById,
  setArticleAiSummary,
  setArticleImportance,
} from "@/lib/db/queries/articles";
import { getUserLlmConfig } from "@/lib/digest/llm-config";
import { generateArticleSummary, MIN_CHARS_FOR_SUMMARY } from "@/lib/articles/enrichment";

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

  try {
    const outcome = await generateArticleSummary(article, llmConfig);

    if (outcome.kind === "no-content") {
      return NextResponse.json(
        { success: false, error: "Article has no text content to summarise" },
        { status: 400 },
      );
    }

    if (outcome.kind === "too-short") {
      return NextResponse.json({
        success: true,
        data: {
          summary: null,
          importance: null,
          skipped: "too-short",
          minChars: MIN_CHARS_FOR_SUMMARY,
          sourceChars: outcome.sourceChars,
        },
      });
    }

    await setArticleAiSummary(article.id, outcome.result.summary);
    if (outcome.result.importance)
      await setArticleImportance(article.id, outcome.result.importance);

    return NextResponse.json({
      success: true,
      data: { summary: outcome.result.summary, importance: outcome.result.importance },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "LLM call failed";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
});
