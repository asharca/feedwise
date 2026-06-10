import { db } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  addTagToArticle,
  getUntaggedArticlesForUser,
  getUnsummarizedArticlesForUser,
  setArticleAiSummary,
  setArticleImportance,
} from "@/lib/db/queries/articles";
import {
  getUsersWithAutoTagEnabled,
  getUsersWithAutoSummarizeEnabled,
  getUserLlmConfig,
} from "@/lib/digest/llm-config";
import { generateArticleSummary, generateTagsForArticle } from "@/lib/articles/enrichment";
import { LlmRateLimitError } from "@/lib/digest/llm-client";

const ARTICLES_PER_RUN_PER_USER = 20;
const LOOKBACK_DAYS = 14;

/**
 * Periodic background job: for every user who has Auto-tag enabled and a
 * working LLM config, fetch their N most recent untagged articles and run
 * tag-suggestions on each, persisting any returned tags.
 *
 * Designed to be called from a setInterval in start-workers.ts. Each tick
 * processes at most ARTICLES_PER_RUN_PER_USER per user; large backlogs catch
 * up over multiple ticks rather than spiking token usage.
 */
export async function runAutoTagging(): Promise<{ users: number; tagged: number }> {
  const userIds = await getUsersWithAutoTagEnabled();
  if (userIds.length === 0) return { users: 0, tagged: 0 };

  let totalTagged = 0;

  await Promise.all(
    userIds.map(async (userId) => {
      let llmConfig;
      try {
        llmConfig = await getUserLlmConfig(userId);
      } catch (err) {
        console.error(`[auto-tag] LLM key decrypt failed for ${userId}:`, err);
        return;
      }
      if (!llmConfig) return;

      const untagged = await getUntaggedArticlesForUser(
        userId,
        LOOKBACK_DAYS,
        ARTICLES_PER_RUN_PER_USER,
      );
      if (untagged.length === 0) return;

      const userTagRows = await db
        .select({ id: tags.id, name: tags.name })
        .from(tags)
        .where(eq(tags.userId, userId));

      // Cap the user-tag list we pass to the model (cost ceiling for users
      // with hundreds of tags) — pass the most recent 100.
      const userTagsForPrompt = userTagRows.slice(0, 100);

      for (const article of untagged) {
        try {
          const suggestions = await generateTagsForArticle(article, userTagsForPrompt, llmConfig);
          if (suggestions.length === 0) continue;

          for (const s of suggestions) {
            try {
              await addTagToArticle(userId, article.id, s.name);
              totalTagged++;
            } catch (err) {
              console.error(
                `[auto-tag] addTag failed (user=${userId}, article=${article.id}, tag=${s.name}):`,
                err,
              );
            }
          }
        } catch (err) {
          // Stop processing this user on rate-limit; resume next tick.
          if (err instanceof LlmRateLimitError) {
            console.warn(`[auto-tag] Rate-limited for user ${userId}, stopping this tick`);
            break;
          }
          console.error(
            `[auto-tag] LLM failed (user=${userId}, article=${article.id}):`,
            err instanceof Error ? err.message : err,
          );
          // Continue with next article rather than aborting whole user
        }
      }
    }),
  );

  return { users: userIds.length, tagged: totalTagged };
}

/**
 * Companion background job: fills in ai_summary + importance for recently
 * added articles when the user has Auto-summarise on. Skips articles whose
 * source text is below the min-chars threshold (returned from the helper
 * as `too-short`) so we don't burn tokens summarising one-line link-posts.
 */
export async function runAutoSummarizing(): Promise<{ users: number; summarized: number }> {
  const userIds = await getUsersWithAutoSummarizeEnabled();
  if (userIds.length === 0) return { users: 0, summarized: 0 };

  let totalSummarized = 0;

  await Promise.all(
    userIds.map(async (userId) => {
      let llmConfig;
      try {
        llmConfig = await getUserLlmConfig(userId);
      } catch (err) {
        console.error(`[auto-summary] LLM key decrypt failed for ${userId}:`, err);
        return;
      }
      if (!llmConfig) return;

      const targets = await getUnsummarizedArticlesForUser(
        userId,
        LOOKBACK_DAYS,
        ARTICLES_PER_RUN_PER_USER,
      );
      if (targets.length === 0) return;

      for (const article of targets) {
        try {
          const outcome = await generateArticleSummary(article, llmConfig);
          if (outcome.kind === "ok") {
            await setArticleAiSummary(article.id, outcome.result.summary);
            if (outcome.result.importance) {
              await setArticleImportance(article.id, outcome.result.importance);
            }
            totalSummarized++;
          }
          // too-short / no-content: skip silently — won't retry next tick
          // either since the same articles will keep returning `too-short`;
          // we accept that cost vs. tracking a "tried-and-skipped" flag.
        } catch (err) {
          if (err instanceof LlmRateLimitError) {
            console.warn(`[auto-summary] Rate-limited for user ${userId}, stopping this tick`);
            break;
          }
          console.error(
            `[auto-summary] LLM failed (user=${userId}, article=${article.id}):`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }),
  );

  return { users: userIds.length, summarized: totalSummarized };
}
