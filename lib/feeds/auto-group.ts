import { callChatCompletion, withLlmRetry } from "@/lib/digest/llm-client";
import type { LlmConfig } from "@/lib/email/queries";

export interface FeedForGrouping {
  id: string;
  title: string | null;
  description: string | null;
  siteUrl: string | null;
}

export interface FolderProposal {
  name: string;
  feedIds: string[];
}

const MAX_DESCRIPTION_CHARS = 200;
const MAX_FOLDER_NAME_CHARS = 60;

/**
 * Ask the user's LLM to bucket their RSS feeds into 3-8 sensible folders.
 * Returns a normalised, deduplicated proposal — every feed appears in at most
 * one folder, every feedId references one the user actually owns. The caller
 * presents this to the user for confirmation before any DB writes happen.
 */
export async function generateFolderProposal(
  feeds: FeedForGrouping[],
  llmConfig: LlmConfig
): Promise<FolderProposal[]> {
  if (feeds.length === 0) return [];

  const items = feeds.map((f) => ({
    id: f.id,
    title: f.title ?? "",
    description: (f.description ?? "").slice(0, MAX_DESCRIPTION_CHARS),
    site: f.siteUrl ?? "",
  }));

  const response = (await withLlmRetry(() =>
    callChatCompletion(llmConfig, {
      system:
        "You organise an RSS reader. Cluster the provided feeds into 3-8 folders by primary topic. " +
        "Each feed goes into exactly ONE folder. Folder names: 1-3 English words, Title Case, no emoji. " +
        "Prefer common categories like Tech, News, Business, Science, Design, Culture, Sports, Personal, Tools. " +
        "Cover every feed id provided — do not drop any. " +
        "Return ONLY JSON matching the schema.",
      user: `Feeds (${items.length} items):\n${JSON.stringify(items)}`,
      jsonSchema: {
        name: "FolderProposal",
        schema: {
          type: "object",
          properties: {
            folders: {
              type: "array",
              minItems: 1,
              maxItems: 12,
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  feedIds: { type: "array", items: { type: "string" } },
                },
                required: ["name", "feedIds"],
              },
            },
          },
          required: ["folders"],
        },
      },
    })
  )) as { folders?: unknown };

  const raw = Array.isArray(response.folders) ? (response.folders as unknown[]) : [];
  const knownIds = new Set(feeds.map((f) => f.id));
  const seenFeedIds = new Set<string>();

  const proposals: FolderProposal[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { name?: unknown; feedIds?: unknown };
    const name = typeof e.name === "string" ? e.name.trim().slice(0, MAX_FOLDER_NAME_CHARS) : "";
    if (!name) continue;

    const ids = Array.isArray(e.feedIds) ? (e.feedIds as unknown[]) : [];
    const feedIds: string[] = [];
    for (const id of ids) {
      if (typeof id !== "string") continue;
      if (!knownIds.has(id)) continue;
      if (seenFeedIds.has(id)) continue;
      seenFeedIds.add(id);
      feedIds.push(id);
    }
    if (feedIds.length === 0) continue;
    proposals.push({ name, feedIds });
  }

  return proposals;
}
