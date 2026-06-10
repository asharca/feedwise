import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getUserLlmConfig } from "@/lib/digest/llm-config";
import { getSubscriptionsForGrouping } from "@/lib/db/queries/feeds";
import { generateFolderProposal } from "@/lib/feeds/auto-group";

/**
 * POST → returns an AI-proposed folder layout for the user's subscriptions.
 * Does NOT mutate state. Use /auto-group/apply to commit the result (or an
 * edited version of it) once the user has reviewed it.
 */
export async function POST() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
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

  const feeds = await getSubscriptionsForGrouping(session.user.id);
  if (feeds.length === 0) {
    return NextResponse.json({ success: true, data: { folders: [] } });
  }

  try {
    const folders = await generateFolderProposal(feeds, llmConfig);
    return NextResponse.json({
      success: true,
      data: {
        folders,
        feeds: feeds.map((f) => ({
          id: f.id,
          title: f.title,
          siteUrl: f.siteUrl,
        })),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "LLM call failed";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
