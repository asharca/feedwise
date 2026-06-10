import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getArticleById } from "@/lib/db/queries/articles";
import { getUserLlmConfig } from "@/lib/digest/llm-config";
import { generateTagsForArticle } from "@/lib/articles/enrichment";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
      { status: 500 },
    );
  }
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
}
