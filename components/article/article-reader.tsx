"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { BookOpen, CircleAlert, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { ArticleMedia, ContentView, FullContentStatus } from "@/lib/db/schema-types";
import { queryKeys } from "@/lib/query/keys";
import {
  addArticleTag,
  patchArticle,
  removeArticleTag,
  suggestArticleTags,
  summarizeArticle,
} from "@/lib/reader/article-api";
import { useFetchFullContentMutation } from "@/lib/reader/use-articles";
import type { ReaderArticleDetail, TagSuggestion } from "@/lib/reader/types";
import { ArticleBody, prepareArticleBodyHtml } from "./article-body";
import { ArticleMediaBlock } from "./article-media-block";
import { ArticleReaderHeader, type ContentDisplayMode } from "./article-reader-header";
import { ArticleRelatedPanel } from "./article-related-panel";
import { ArticleSummaryPanel } from "./article-summary-panel";

export interface ArticleReaderItem {
  id: string;
  feedTitle: string | null;
  title: string | null;
  author: string | null;
  url: string | null;
  contentHtml: string | null;
  contentText?: string | null;
  media?: ArticleMedia[] | null;
  view?: ContentView;
  fullContentHtml?: string | null;
  fullContentStatus?: FullContentStatus | null;
  fetchFullText?: boolean;
  aiSummary?: string | null;
  importance?: "high" | "med" | "low" | null;
  tags?: Array<{ id: string; name: string; color?: string | null }>;
  publishedAt: Date | string | null;
  createdAt?: Date | string | null;
  isRead: boolean;
  isStarred: boolean;
}

interface ArticleReaderProps {
  article: ArticleReaderItem | null;
  onMarkRead: (id: string, read: boolean) => void;
  onStar: (id: string, starred: boolean) => void;
  onBack?: () => void;
  onSelectRelated?: (articleId: string) => void;
  contextLabel?: string;
  /**
   * When true, automatically POST to /summarize on article open if there is
   * no cached aiSummary yet. Driven by user setting + LLM-enabled gate.
   */
  autoSummarize?: boolean;
}

function estimateReadingTime(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 1000));
}

export function ArticleReader({
  article,
  onMarkRead,
  onStar,
  onBack,
  onSelectRelated,
  contextLabel,
  autoSummarize = false,
}: ArticleReaderProps) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const progressSaveRef = useRef<number | undefined>(undefined);
  const autoTriggeredRef = useRef<Set<string>>(new Set());

  // Article-scoped local overrides so mutations reflect immediately even when
  // rendered standalone without a parent reading back from the query cache.
  const [summaryState, setSummaryState] = useState<{
    articleId: string;
    summary: string | null;
    importance: "high" | "med" | "low" | null;
  } | null>(null);
  const [tagSuggestionState, setTagSuggestionState] = useState<{
    articleId: string;
    suggestions: TagSuggestion[];
    accepted: Set<string>;
  } | null>(null);
  const [tagsOverride, setTagsOverride] = useState<{
    articleId: string;
    tags: Array<{ id: string; name: string }>;
  } | null>(null);
  const [fullContentOverride, setFullContentOverride] = useState<{
    articleId: string;
    html: string | null;
    status: FullContentStatus | null;
  } | null>(null);
  const [modePreference, setModePreference] = useState<{
    articleId: string;
    mode: ContentDisplayMode;
  } | null>(null);

  const articleId = article?.id;
  const currentIdRef = useRef<string | undefined>(articleId);
  currentIdRef.current = articleId;

  const effectiveFullHtml =
    fullContentOverride && fullContentOverride.articleId === articleId
      ? fullContentOverride.html
      : (article?.fullContentHtml ?? null);

  const effectiveFullStatus =
    fullContentOverride && fullContentOverride.articleId === articleId
      ? fullContentOverride.status
      : (article?.fullContentStatus ?? null);

  const hasFullContent = Boolean(effectiveFullHtml);
  const contentMode: ContentDisplayMode =
    modePreference && modePreference.articleId === articleId
      ? modePreference.mode
      : hasFullContent
        ? "full"
        : "original";

  const effectiveAiSummary =
    summaryState && summaryState.articleId === articleId
      ? summaryState.summary
      : (article?.aiSummary ?? null);

  const effectiveImportance =
    summaryState && summaryState.articleId === articleId
      ? summaryState.importance
      : (article?.importance ?? null);

  const effectiveTags = useMemo(() => {
    if (tagsOverride && tagsOverride.articleId === articleId) return tagsOverride.tags;
    return article?.tags?.map((t) => ({ id: t.id, name: t.name })) ?? [];
  }, [article?.tags, articleId, tagsOverride]);

  const activeSuggestions =
    tagSuggestionState && tagSuggestionState.articleId === articleId
      ? tagSuggestionState.suggestions
      : null;

  const acceptedTagNames = useMemo(
    () =>
      tagSuggestionState && tagSuggestionState.articleId === articleId
        ? tagSuggestionState.accepted
        : new Set<string>(),
    [articleId, tagSuggestionState],
  );

  // Sanitize + proxy body HTML once per active HTML source (NOT on scroll
  // re-renders) so memoized ArticleBody never recreates <img> nodes on iOS.
  const activeRawHtml =
    contentMode === "full" && effectiveFullHtml ? effectiveFullHtml : (article?.contentHtml ?? "");

  const bodyHtml = useMemo(() => prepareArticleBodyHtml(activeRawHtml), [activeRawHtml]);
  const bodyHasImages = useMemo(() => /<img\b/i.test(activeRawHtml), [activeRawHtml]);

  const summarizeMutation = useMutation({
    mutationFn: ({ targetId }: { targetId: string; manual: boolean }) => summarizeArticle(targetId),
    onSuccess: (data, { targetId, manual }) => {
      if (data.skipped === "too-short") {
        if (manual && currentIdRef.current === targetId) {
          toast.info(`文章字数较少，无需摘要（${data.sourceChars} < ${data.minChars} 字）`);
        }
        return;
      }
      queryClient.setQueryData<ReaderArticleDetail>(queryKeys.article.detail(targetId), (prev) =>
        prev
          ? {
              ...prev,
              aiSummary: data.summary ?? prev.aiSummary,
              importance: data.importance ?? prev.importance,
            }
          : prev,
      );
      if (currentIdRef.current !== targetId) return;
      setSummaryState({
        articleId: targetId,
        summary: data.summary ?? null,
        importance: data.importance ?? effectiveImportance,
      });
    },
    onError: (err, { targetId }) => {
      if (currentIdRef.current === targetId) {
        toast.error(err instanceof Error ? err.message : "生成摘要失败");
      }
    },
  });

  const suggestTagsMutation = useMutation({
    mutationFn: (targetId: string) => suggestArticleTags(targetId),
    onSuccess: (data, targetId) => {
      if (currentIdRef.current !== targetId) return;
      setTagSuggestionState({
        articleId: targetId,
        suggestions: data.suggestions ?? [],
        accepted: new Set(),
      });
    },
    onError: (err, targetId) => {
      if (currentIdRef.current === targetId) {
        toast.error(err instanceof Error ? err.message : "推荐标签失败");
      }
    },
  });

  const acceptTagMutation = useMutation({
    mutationFn: ({ targetId, name }: { targetId: string; name: string }) =>
      addArticleTag(targetId, name),
    onSuccess: (data, { targetId, name }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tags.all });
      queryClient.setQueryData<ReaderArticleDetail>(queryKeys.article.detail(targetId), (prev) => {
        if (!prev) return prev;
        const current = prev.tags ?? [];
        if (current.some((t) => t.id === data.tagId)) return prev;
        return { ...prev, tags: [...current, { id: data.tagId, name: data.name }] };
      });
      if (currentIdRef.current !== targetId) return;
      setTagSuggestionState((prev) => {
        if (!prev || prev.articleId !== targetId) return prev;
        const next = new Set(prev.accepted);
        next.add(name);
        return { ...prev, accepted: next };
      });
      setTagsOverride((prev) => {
        const base =
          prev && prev.articleId === targetId
            ? prev.tags
            : (article?.tags?.map((t) => ({ id: t.id, name: t.name })) ?? []);
        if (base.some((t) => t.id === data.tagId)) return { articleId: targetId, tags: base };
        return {
          articleId: targetId,
          tags: [...base, { id: data.tagId, name: data.name }],
        };
      });
      toast.success(`已添加标签：${name}`);
    },
    onError: (err, { targetId }) => {
      if (currentIdRef.current === targetId) {
        toast.error(err instanceof Error ? err.message : "添加标签失败");
      }
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: ({ targetId, tagId }: { targetId: string; tagId: string }) =>
      removeArticleTag(targetId, tagId),
    onMutate: ({ targetId, tagId }) => {
      const prevTags = effectiveTags;
      setTagsOverride({
        articleId: targetId,
        tags: prevTags.filter((t) => t.id !== tagId),
      });
      return { prevTags };
    },
    onSuccess: (_data, { targetId, tagId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tags.all });
      queryClient.setQueryData<ReaderArticleDetail>(queryKeys.article.detail(targetId), (prev) =>
        prev ? { ...prev, tags: (prev.tags ?? []).filter((t) => t.id !== tagId) } : prev,
      );
    },
    onError: (err, { targetId }, context) => {
      if (currentIdRef.current === targetId && context) {
        setTagsOverride({ articleId: targetId, tags: context.prevTags });
        toast.error(err instanceof Error ? err.message : "移除标签失败");
      }
    },
  });

  const fetchFullMutation = useFetchFullContentMutation();

  const progressMutation = useMutation({
    mutationFn: ({ targetId, readProgress }: { targetId: string; readProgress: number }) =>
      patchArticle(targetId, { readProgress }),
  });

  const { mutate: runSummarize } = summarizeMutation;
  useEffect(() => {
    if (!autoSummarize || !article || article.aiSummary) return;
    if (autoTriggeredRef.current.has(article.id)) return;
    autoTriggeredRef.current.add(article.id);
    runSummarize({ targetId: article.id, manual: false });
  }, [article, autoSummarize, runSummarize]);

  const { mutate: saveProgress } = progressMutation;
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !article) return;
    const max = el.scrollHeight - el.clientHeight;
    const progress = max > 0 ? el.scrollTop / max : 0;
    setScrollProgress(progress);

    clearTimeout(progressSaveRef.current);
    progressSaveRef.current = window.setTimeout(() => {
      saveProgress({ targetId: article.id, readProgress: progress });
    }, 1000);
  }, [article, saveProgress]);

  useEffect(() => {
    setScrollProgress(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    return () => {
      clearTimeout(progressSaveRef.current);
    };
  }, [articleId]);

  function handleFetchFullContent() {
    if (!article) return;
    const targetId = article.id;
    fetchFullMutation.mutate(targetId, {
      onSuccess: (result) => {
        if (currentIdRef.current !== targetId) return;
        setFullContentOverride({
          articleId: targetId,
          html: result.html ?? effectiveFullHtml,
          status: result.status,
        });
        if (result.status === "ok" && result.html) {
          setModePreference({ articleId: targetId, mode: "full" });
        }
      },
    });
  }

  async function handleCopyUrl() {
    if (!article?.url) return;
    await navigator.clipboard.writeText(article.url);
    toast.success("已复制链接");
  }

  function handleOpenOriginal() {
    if (!article?.url) return;
    window.open(article.url, "_blank", "noopener,noreferrer");
  }

  if (!article) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <div className="flex size-14 items-center justify-center rounded-lg bg-muted">
          <BookOpen className="size-7 text-muted-foreground/30" />
        </div>
        <p className="text-sm">选择一篇文章开始阅读</p>
      </div>
    );
  }

  const summarizingForCurrent =
    summarizeMutation.isPending && summarizeMutation.variables?.targetId === article.id;
  const suggestingTagsForCurrent =
    suggestTagsMutation.isPending && suggestTagsMutation.variables === article.id;
  const fetchingFullForCurrent =
    fetchFullMutation.isPending && fetchFullMutation.variables === article.id;

  const readingTime = estimateReadingTime(article.contentText ?? activeRawHtml);
  const displayDate = article.publishedAt ?? article.createdAt;

  return (
    <div className="relative flex h-full flex-col overflow-hidden animate-in fade-in duration-200 ease-[var(--ease-out)] motion-reduce:animate-none">
      <ArticleReaderHeader
        articleId={article.id}
        url={article.url}
        isRead={article.isRead}
        isStarred={article.isStarred}
        scrollProgress={scrollProgress}
        contextLabel={contextLabel}
        hasFullContent={hasFullContent}
        contentMode={contentMode}
        onContentModeChange={(mode) => setModePreference({ articleId: article.id, mode })}
        fetchingFullContent={fetchingFullForCurrent}
        onFetchFullContent={handleFetchFullContent}
        hasAiSummary={Boolean(effectiveAiSummary)}
        summarizing={summarizingForCurrent}
        onSummarize={() => summarizeMutation.mutate({ targetId: article.id, manual: true })}
        suggestingTags={suggestingTagsForCurrent}
        onSuggestTags={() => suggestTagsMutation.mutate(article.id)}
        onMarkRead={onMarkRead}
        onStar={onStar}
        onBack={onBack}
        onCopyUrl={handleCopyUrl}
        onOpenOriginal={handleOpenOriginal}
      />

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto scrollbar-thin"
      >
        <div className="mx-auto max-w-2xl px-6 py-8 sm:px-8">
          <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="max-w-full truncate font-medium">{article.feedTitle}</span>
            {article.author && (
              <>
                <span className="text-muted-foreground/40">&middot;</span>
                <span>{article.author}</span>
              </>
            )}
            {displayDate && (
              <>
                <span className="text-muted-foreground/40">&middot;</span>
                <span>
                  {formatDistanceToNow(new Date(displayDate), {
                    addSuffix: true,
                    locale: zhCN,
                  })}
                </span>
              </>
            )}
            {readingTime > 0 && (
              <>
                <span className="text-muted-foreground/40">&middot;</span>
                <span>约 {readingTime} 分钟</span>
              </>
            )}
          </div>

          <h1 className="mb-4 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
            {article.title}
          </h1>

          {effectiveFullStatus === "failed" && (
            <div
              role="status"
              className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-xs text-destructive"
            >
              <div className="flex items-center gap-2">
                <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
                <span>全文抓取失败，当前显示 RSS 原始内容。</span>
              </div>
              {article.url && (
                <button
                  type="button"
                  onClick={handleFetchFullContent}
                  disabled={fetchingFullForCurrent}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 font-medium underline-offset-2 hover:underline disabled:opacity-50"
                >
                  <RefreshCw className="size-3" aria-hidden="true" />
                  重新抓取
                </button>
              )}
            </div>
          )}

          <ArticleSummaryPanel
            importance={effectiveImportance}
            aiSummary={effectiveAiSummary}
            summarizing={summarizingForCurrent}
            tags={effectiveTags}
            tagSuggestions={activeSuggestions}
            acceptedTagNames={acceptedTagNames}
            onAcceptTag={(suggestion) =>
              acceptTagMutation.mutate({ targetId: article.id, name: suggestion.name })
            }
            onRemoveTag={(tagId) => removeTagMutation.mutate({ targetId: article.id, tagId })}
          />

          <ArticleMediaBlock
            media={article.media}
            bodyHasImages={bodyHasImages}
            articleUrl={article.url}
            title={article.title}
          />

          {bodyHtml ? (
            <ArticleBody html={bodyHtml} />
          ) : (
            <p className="text-sm text-muted-foreground">暂无正文内容。</p>
          )}

          <ArticleRelatedPanel articleId={article.id} onSelectArticle={onSelectRelated} />

          <div className="h-16" />
        </div>
      </div>
    </div>
  );
}
