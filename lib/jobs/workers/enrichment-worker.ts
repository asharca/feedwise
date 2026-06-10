import {
  getUnsummarizedArticlesForUser,
  getUntaggedArticlesForUser,
  setArticleAiSummary,
  setArticleImportance,
} from "@/lib/db/queries/articles";
import {
  getUsersWithAutoTagEnabled,
  getUsersWithAutoSummarizeEnabled,
  getUserLlmConfig,
  type LlmConfig,
} from "@/lib/digest/llm-config";
import { generateArticleSummary } from "@/lib/articles/enrichment";
import { tagUserArticles } from "@/lib/articles/tag-batch";
import { LlmRateLimitError } from "@/lib/digest/llm-client";

const ARTICLES_PER_RUN_PER_USER = 20;
const LOOKBACK_DAYS = 14;

/**
 * Run `fn` for every listed user that has a working LLM config. Config
 * lookup failures are logged and skip the user; per-user failures must be
 * handled inside `fn`.
 */
async function forEachUserWithLlm(
  label: string,
  userIds: string[],
  fn: (userId: string, llmConfig: LlmConfig) => Promise<void>,
): Promise<void> {
  await Promise.all(
    userIds.map(async (userId) => {
      let llmConfig: LlmConfig | null;
      try {
        llmConfig = await getUserLlmConfig(userId);
      } catch (err) {
        console.error(`[${label}] LLM config lookup failed for ${userId}:`, err);
        return;
      }
      if (!llmConfig) return;
      await fn(userId, llmConfig);
    }),
  );
}

/**
 * Periodic background job: for every user with Auto-tag enabled, tag their
 * most recent untagged articles (at most ARTICLES_PER_RUN_PER_USER per tick;
 * backlogs catch up over multiple ticks rather than spiking token usage).
 */
export async function runAutoTagging(): Promise<{ users: number; tagged: number }> {
  const userIds = await getUsersWithAutoTagEnabled();
  if (userIds.length === 0) return { users: 0, tagged: 0 };

  let totalTagged = 0;
  await forEachUserWithLlm("auto-tag", userIds, async (userId, llmConfig) => {
    const untagged = await getUntaggedArticlesForUser(
      userId,
      LOOKBACK_DAYS,
      ARTICLES_PER_RUN_PER_USER,
    );
    if (untagged.length === 0) return;
    const result = await tagUserArticles(userId, untagged, llmConfig);
    totalTagged += result.tagged;
  });

  return { users: userIds.length, tagged: totalTagged };
}

/**
 * Companion job: fills in ai_summary + importance for recent articles when
 * the user has Auto-summarise on. Articles below the min-chars threshold are
 * skipped (`too-short`) — same articles will keep returning too-short; we
 * accept that cost vs. tracking a "tried-and-skipped" flag.
 */
export async function runAutoSummarizing(): Promise<{ users: number; summarized: number }> {
  const userIds = await getUsersWithAutoSummarizeEnabled();
  if (userIds.length === 0) return { users: 0, summarized: 0 };

  let totalSummarized = 0;
  await forEachUserWithLlm("auto-summary", userIds, async (userId, llmConfig) => {
    const targets = await getUnsummarizedArticlesForUser(
      userId,
      LOOKBACK_DAYS,
      ARTICLES_PER_RUN_PER_USER,
    );
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
  });

  return { users: userIds.length, summarized: totalSummarized };
}
