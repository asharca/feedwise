import { callChatCompletion, withLlmRetry } from "@/lib/digest/llm-client";
import type { LlmConfig } from "@/lib/digest/llm-config";

const MAX_TAG_INPUT_CHARS = 4_000;
const MAX_SUMMARY_INPUT_CHARS = 8_000;
export const MIN_CHARS_FOR_SUMMARY = 800;

export interface TagSuggestion {
  name: string;
  existingTagId: string | null;
}

interface EnrichableArticle {
  title: string | null;
  summary: string | null;
  aiSummary?: string | null;
  contentText: string | null;
  contentHtml: string | null;
}

export interface SummaryResult {
  summary: string;
  importance: "high" | "med" | "low" | null;
}

export type SummaryOutcome =
  | { kind: "ok"; result: SummaryResult }
  | { kind: "too-short"; sourceChars: number }
  | { kind: "no-content" };

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Single-call LLM enrichment: returns both a 3-5 sentence summary and an
 * importance bucket for an article. Used by the on-demand /summarize route
 * AND the background enrichment worker, so the prompt stays consistent.
 *
 * Returns `too-short` (rather than throwing) for articles below the min
 * content length — callers decide whether to surface that or just skip.
 */
export async function generateArticleSummary(
  article: EnrichableArticle,
  llmConfig: LlmConfig,
): Promise<SummaryOutcome> {
  const sourceText = pickFullText(article);
  if (!sourceText) return { kind: "no-content" };
  if (sourceText.length < MIN_CHARS_FOR_SUMMARY) {
    return { kind: "too-short", sourceChars: sourceText.length };
  }

  const truncated = sourceText.slice(0, MAX_SUMMARY_INPUT_CHARS);
  const titleHint = article.title ?? "(no title)";

  const response = (await withLlmRetry(() =>
    callChatCompletion(llmConfig, {
      system:
        'You analyse news articles. Reply with JSON: { "summary": string, "importance": "high"|"med"|"low" }. ' +
        "summary: 3-5 sentences, neutral, factual, no marketing language, do not start with 'This article...'. " +
        "importance: 'high' for breaking news / major announcements / safety issues; 'med' for noteworthy updates; 'low' for routine, niche, or marketing-heavy content.",
      user: `Title: ${titleHint}\n\nArticle:\n${truncated}`,
      jsonSchema: {
        name: "article_summary",
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            importance: { type: "string", enum: ["high", "med", "low"] },
          },
          required: ["summary", "importance"],
        },
      },
    }),
  )) as { summary?: unknown; importance?: unknown };

  const summary = typeof response.summary === "string" ? response.summary.trim() : "";
  if (!summary) return { kind: "no-content" };

  const importance: SummaryResult["importance"] =
    response.importance === "high" || response.importance === "med" || response.importance === "low"
      ? response.importance
      : null;

  return { kind: "ok", result: { summary, importance } };
}

function pickFullText(article: EnrichableArticle): string {
  if (article.contentText && article.contentText.length > 50) return article.contentText;
  if (article.contentHtml) return stripHtml(article.contentHtml);
  return "";
}

function pickSourceText(article: EnrichableArticle): string {
  if (article.aiSummary && article.aiSummary.length > 100) return article.aiSummary;
  if (article.summary && article.summary.length > 100) return article.summary;
  if (article.contentText && article.contentText.length > 100) return article.contentText;
  if (article.contentHtml) return stripHtml(article.contentHtml);
  return "";
}

/**
 * Ask the configured LLM for 1-3 short topic tags for an article, biasing toward
 * reusing the user's existing tag names. Returns up to 3 suggestions; throws on
 * LLM error so callers can decide whether to log + skip or surface a 502.
 *
 * Used by both the on-demand /tag-suggestions endpoint and the background
 * enrichment worker, so the prompt and post-processing stay consistent.
 */
export async function generateTagsForArticle(
  article: EnrichableArticle,
  userTags: Array<{ id: string; name: string }>,
  llmConfig: LlmConfig,
): Promise<TagSuggestion[]> {
  const sourceText = pickSourceText(article);
  if (!sourceText) return [];

  const truncated = sourceText.slice(0, MAX_TAG_INPUT_CHARS);
  const titleHint = article.title ?? "(no title)";
  const tagNamesList = userTags.map((t) => t.name).join(", ");

  const response = (await withLlmRetry(() =>
    callChatCompletion(llmConfig, {
      system:
        "You suggest 1-3 short topic tags for news articles. " +
        "Tags must be 1-3 words, lowercase, no punctuation. " +
        "Prefer reusing tags from the user's existing tag list when relevant; otherwise propose a new one. " +
        'Reply with JSON: { "tags": string[] }.',
      user: `Article title: ${titleHint}\n\nUser's existing tags: ${tagNamesList || "(none)"}\n\nArticle:\n${truncated}`,
      jsonSchema: {
        name: "tag_suggestions",
        schema: {
          type: "object",
          properties: {
            tags: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
              maxItems: 5,
            },
          },
          required: ["tags"],
        },
      },
    }),
  )) as { tags?: unknown };

  const raw = Array.isArray(response.tags) ? response.tags : [];
  return raw
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && t.length <= 50)
    .slice(0, 3)
    .map((name) => {
      const existing = userTags.find((t) => t.name.toLowerCase() === name);
      return { name, existingTagId: existing?.id ?? null };
    });
}
