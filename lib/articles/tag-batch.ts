import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { addTagToArticle } from "@/lib/db/queries/articles";
import { generateTagsForArticle } from "@/lib/articles/enrichment";
import { LlmRateLimitError } from "@/lib/digest/llm-client";
import type { LlmConfig } from "@/lib/digest/llm-config";

// Cap the user-tag list passed to the model (cost ceiling for users with
// hundreds of tags).
const MAX_USER_TAGS_IN_PROMPT = 100;

export interface TaggableArticle {
  id: string;
  title: string | null;
  summary: string | null;
  aiSummary: string | null;
  contentText: string | null;
  contentHtml: string | null;
}

export interface TagBatchResult {
  /** Articles whose LLM call completed — including ones that got no tags. */
  attempted: number;
  /** Tag links actually written. */
  tagged: number;
  /** Articles whose LLM call threw a non-rate-limit error. */
  failed: number;
  /** True if the batch stopped early on a 429. */
  rateLimited: boolean;
}

export interface TagBatchDeps {
  generateTags: typeof generateTagsForArticle;
  addTag: typeof addTagToArticle;
  getUserTags: (userId: string) => Promise<Array<{ id: string; name: string }>>;
}

async function defaultGetUserTags(userId: string): Promise<Array<{ id: string; name: string }>> {
  return db.select({ id: tags.id, name: tags.name }).from(tags).where(eq(tags.userId, userId));
}

const defaultDeps: TagBatchDeps = {
  generateTags: generateTagsForArticle,
  addTag: addTagToArticle,
  getUserTags: defaultGetUserTags,
};

/**
 * Tag a batch of articles for one user. Rate limits stop the batch (resume
 * on a later call); other LLM errors skip the article and continue.
 */
export async function tagUserArticles(
  userId: string,
  articles: TaggableArticle[],
  llmConfig: LlmConfig,
  deps: TagBatchDeps = defaultDeps,
): Promise<TagBatchResult> {
  const result: TagBatchResult = { attempted: 0, tagged: 0, failed: 0, rateLimited: false };
  if (articles.length === 0) return result;

  const userTags = (await deps.getUserTags(userId)).slice(0, MAX_USER_TAGS_IN_PROMPT);

  for (const article of articles) {
    try {
      const suggestions = await deps.generateTags(article, userTags, llmConfig);
      result.attempted++;
      for (const s of suggestions) {
        try {
          await deps.addTag(userId, article.id, s.name);
          result.tagged++;
        } catch (err) {
          console.error(
            `[tag-batch] addTag failed (user=${userId}, article=${article.id}, tag=${s.name}):`,
            err,
          );
        }
      }
    } catch (err) {
      if (err instanceof LlmRateLimitError) {
        result.rateLimited = true;
        console.warn(`[tag-batch] Rate-limited for user ${userId}, stopping batch`);
        break;
      }
      result.failed++;
      console.error(
        `[tag-batch] LLM failed (user=${userId}, article=${article.id}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return result;
}
