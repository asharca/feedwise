import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getArticleById, setArticleAiSummary, setArticleImportance } from "@/lib/db/queries/articles";
import { getUserLlmConfig } from "@/lib/email/queries";
import { generateArticleSummary, MIN_CHARS_FOR_SUMMARY } from "@/lib/articles/enrichment";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const article = await getArticleById(session.user.id, id);
  if (!article) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  let llmConfig;
  try {
    llmConfig = await getUserLlmConfig(session.user.id);
  } catch {
    return NextResponse.json(
      { success: false, error: "LLM key could not be decrypted" },
      { status: 500 }
    );
  }
  if (!llmConfig) {
    return NextResponse.json(
      { success: false, error: "No LLM configured — set one in Settings → Smart Digest" },
      { status: 400 }
    );
  }

  try {
    const outcome = await generateArticleSummary(article, llmConfig);

    if (outcome.kind === "no-content") {
      return NextResponse.json(
        { success: false, error: "Article has no text content to summarise" },
        { status: 400 }
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
}
