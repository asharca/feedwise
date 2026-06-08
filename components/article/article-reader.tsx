"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import DOMPurify from "dompurify";
import {
  ExternalLink,
  Star,
  CheckCheck,
  BookOpen,
  PanelRightClose,
  Copy,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SidebarTrigger } from "@/components/ui/sidebar";

function proxyImagesInHtml(html: string): string {
  return html.replace(
    /(<img\b[^>]*?\ssrc=)(["'])(https?:\/\/[^"']+)\2/gi,
    (_, prefix, quote, url) =>
      `${prefix}${quote}/api/image-proxy?url=${encodeURIComponent(url)}${quote} loading="lazy" decoding="async"`,
  );
}

interface ArticleDetail {
  id: string;
  feedTitle: string | null;
  title: string | null;
  author: string | null;
  url: string | null;
  contentHtml: string | null;
  contentText?: string | null;
  // AI-generated summary, only set by the user clicking Summarize. The feed's
  // own RSS-provided `summary` is intentionally not exposed here so we never
  // mislabel it as AI output.
  aiSummary?: string | null;
  importance?: "high" | "med" | "low" | null;
  tags?: Array<{ id: string; name: string; color?: string | null }>;
  publishedAt: Date | null;
  createdAt?: Date | null;
  isRead: boolean;
  isStarred: boolean;
}

interface TagSuggestion {
  name: string;
  existingTagId: string | null;
}

interface ArticleReaderProps {
  article: ArticleDetail | null;
  onMarkRead: (id: string, read: boolean) => void;
  onStar: (id: string, starred: boolean) => void;
  onBack?: () => void;
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

function ActionButton({
  onClick,
  title,
  children,
  className,
}: {
  onClick?: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "size-8 inline-flex items-center justify-center rounded-md hover:bg-accent transition-colors",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function ArticleReader({
  article,
  onMarkRead,
  onStar,
  onBack,
  contextLabel,
  autoSummarize = false,
}: ArticleReaderProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const progressSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [aiSummary, setAiSummary] = useState<string | null>(article?.aiSummary ?? null);
  const [importance, setImportance] = useState<"high" | "med" | "low" | null>(
    article?.importance ?? null,
  );
  const [summarizing, setSummarizing] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestion[] | null>(null);
  const [suggestingTags, setSuggestingTags] = useState(false);
  const [acceptedTagNames, setAcceptedTagNames] = useState<Set<string>>(new Set());
  const [currentTags, setCurrentTags] = useState<Array<{ id: string; name: string }>>(
    article?.tags?.map((t) => ({ id: t.id, name: t.name })) ?? [],
  );

  // Track which article ids we already auto-triggered for, so flipping
  // dependent state (autoSummarize, etc.) doesn't refire the request on the
  // same article. Cleared when article id changes.
  const autoTriggeredRef = useRef<Set<string>>(new Set());

  // Always reflects the currently-displayed article id. Used to drop late
  // /summarize responses for articles the user has navigated away from.
  const currentArticleIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    currentArticleIdRef.current = article?.id;
    setAiSummary(article?.aiSummary ?? null);
    setImportance(article?.importance ?? null);
    setTagSuggestions(null);
    setAcceptedTagNames(new Set());
    setCurrentTags(article?.tags?.map((t) => ({ id: t.id, name: t.name })) ?? []);
  }, [article?.id, article?.aiSummary, article?.importance, article?.tags]);

  const handleSummarize = useCallback(
    async (opts?: { manual?: boolean }) => {
      if (!article) return;
      const manual = opts?.manual === true;
      const targetId = article.id;
      setSummarizing(true);
      try {
        const res = await fetch(`/api/articles/${targetId}/summarize`, { method: "POST" });
        const data = (await res.json()) as {
          success: boolean;
          error?: string;
          data?: {
            summary: string | null;
            importance: "high" | "med" | "low" | null;
            skipped?: string;
            minChars?: number;
            sourceChars?: number;
          };
        };
        if (!data.success) {
          toast.error(data.error ?? "Failed to summarise");
          return;
        }
        // Guard against the user clicking through several articles before this
        // request lands — we only want to apply the result to the article that
        // initiated it.
        if (targetId !== currentArticleIdRef.current) return;

        if (data.data?.skipped === "too-short") {
          // Article is short enough that no summary is needed. Quietly skip on
          // auto-trigger; tell the user only if they clicked the button.
          if (manual) {
            toast.info(
              `Article is too short to summarise (${data.data.sourceChars} < ${data.data.minChars} chars).`,
            );
          }
          return;
        }

        setAiSummary(data.data?.summary ?? null);
        if (data.data?.importance) setImportance(data.data.importance);
      } catch (err) {
        if (targetId === currentArticleIdRef.current) {
          toast.error(err instanceof Error ? err.message : "Failed to summarise");
        }
      } finally {
        if (targetId === currentArticleIdRef.current) {
          setSummarizing(false);
        }
      }
    },
    [article],
  );

  // Auto-summarise on article open when the user has opted in.
  useEffect(() => {
    if (!autoSummarize) return;
    if (!article) return;
    if (article.aiSummary) return;
    if (autoTriggeredRef.current.has(article.id)) return;
    autoTriggeredRef.current.add(article.id);
    handleSummarize();
  }, [article, autoSummarize, handleSummarize]);

  async function handleSuggestTags() {
    if (!article) return;
    setSuggestingTags(true);
    try {
      const res = await fetch(`/api/articles/${article.id}/tag-suggestions`, { method: "POST" });
      const data = (await res.json()) as {
        success: boolean;
        error?: string;
        data?: { suggestions: TagSuggestion[] };
      };
      if (!data.success) {
        toast.error(data.error ?? "Failed to suggest tags");
        return;
      }
      setTagSuggestions(data.data?.suggestions ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to suggest tags");
    } finally {
      setSuggestingTags(false);
    }
  }

  async function handleAcceptTag(suggestion: TagSuggestion) {
    if (!article) return;
    try {
      const res = await fetch(`/api/articles/${article.id}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: suggestion.name }),
      });
      const data = (await res.json()) as {
        success: boolean;
        error?: string;
        data?: { tagId: string; name: string };
      };
      if (!data.success) {
        toast.error(data.error ?? "Failed to add tag");
        return;
      }
      setAcceptedTagNames((prev) => new Set(prev).add(suggestion.name));
      if (data.data) {
        setCurrentTags((prev) =>
          prev.find((t) => t.id === data.data!.tagId)
            ? prev
            : [...prev, { id: data.data!.tagId, name: data.data!.name }],
        );
      }
      window.dispatchEvent(new CustomEvent("tags-changed"));
      toast.success(`Tagged: ${suggestion.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add tag");
    }
  }

  async function handleRemoveTag(tagId: string) {
    if (!article) return;
    const prev = currentTags;
    setCurrentTags((cur) => cur.filter((t) => t.id !== tagId));
    try {
      const res = await fetch(`/api/articles/${article.id}/tags/${tagId}`, { method: "DELETE" });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) {
        setCurrentTags(prev);
        toast.error(data.error ?? "Failed to remove tag");
        return;
      }
      window.dispatchEvent(new CustomEvent("tags-changed"));
    } catch (err) {
      setCurrentTags(prev);
      toast.error(err instanceof Error ? err.message : "Failed to remove tag");
    }
  }

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !article) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const max = scrollHeight - clientHeight;
    const progress = max > 0 ? scrollTop / max : 0;
    setScrollProgress(progress);

    if (progressSaveRef.current) clearTimeout(progressSaveRef.current);
    progressSaveRef.current = setTimeout(() => {
      fetch(`/api/articles/${article.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readProgress: progress }),
      }).catch(() => {});
    }, 1000);
  }, [article]);

  useEffect(() => {
    setScrollProgress(0);
    return () => {
      if (progressSaveRef.current) clearTimeout(progressSaveRef.current);
    };
  }, [article?.id]);

  async function handleCopyUrl() {
    if (!article?.url) return;
    await navigator.clipboard.writeText(article.url);
    toast.success("Link copied");
  }

  if (!article) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <div className="size-14 rounded-lg bg-muted flex items-center justify-center">
          <BookOpen className="size-7 text-muted-foreground/30" />
        </div>
        <p className="text-sm">Select an article to read</p>
      </div>
    );
  }

  const readingTime = estimateReadingTime(article.contentText ?? article.contentHtml);

  return (
    <div className="flex flex-col h-full overflow-hidden relative animate-in fade-in duration-200 ease-[var(--ease-out)] motion-reduce:animate-none">
      {/* Scroll progress */}
      <div className="scroll-progress" style={{ width: `${scrollProgress * 100}%` }} />

      {/* Action bar */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 shrink-0 border-b border-border/50">
        <div className="flex items-center gap-0.5">
          {/* On mobile the list is hidden when an article is open, so expose
              both a back-to-list button and the sidebar trigger here. */}
          <SidebarTrigger className="md:hidden" />
          {onBack && (
            <ActionButton title="Collapse" onClick={onBack}>
              <PanelRightClose className="size-4 text-muted-foreground" />
            </ActionButton>
          )}
          {contextLabel && (
            <span className="hidden md:inline-block text-xs text-muted-foreground truncate max-w-[160px] ml-1">
              {contextLabel}
            </span>
          )}
        </div>
        <ActionButton
          title={article.isRead ? "Mark unread" : "Mark read"}
          onClick={() => onMarkRead(article.id, !article.isRead)}
        >
          <CheckCheck
            className={cn("size-4", article.isRead ? "text-primary" : "text-muted-foreground")}
          />
        </ActionButton>

        <ActionButton
          title={article.isStarred ? "Unstar" : "Star"}
          onClick={() => onStar(article.id, !article.isStarred)}
        >
          <Star
            className={cn(
              "size-4",
              article.isStarred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground",
            )}
          />
        </ActionButton>

        {article.url && (
          <>
            <ActionButton title="Copy link" onClick={handleCopyUrl}>
              <Copy className="size-4 text-muted-foreground" />
            </ActionButton>
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open original"
              className="size-8 inline-flex items-center justify-center rounded-md hover:bg-accent transition-colors"
            >
              <ExternalLink className="size-4 text-muted-foreground" />
            </a>
          </>
        )}
        <div className="w-px h-5 bg-border/60 mx-1" aria-hidden />
        <ActionButton
          title={aiSummary ? "Re-summarise" : "Summarise with AI"}
          onClick={() => handleSummarize({ manual: true })}
        >
          <Sparkles
            className={cn(
              "size-4",
              summarizing
                ? "animate-pulse text-primary"
                : aiSummary
                  ? "text-primary"
                  : "text-muted-foreground",
            )}
          />
        </ActionButton>
        <ActionButton title="Suggest tags with AI" onClick={handleSuggestTags}>
          <Tag
            className={cn(
              "size-4",
              suggestingTags ? "animate-pulse text-primary" : "text-muted-foreground",
            )}
          />
        </ActionButton>
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto scrollbar-thin"
      >
        <div className="max-w-2xl mx-auto px-6 py-8 sm:px-8">
          {/* Source meta */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
            <span className="font-medium">{article.feedTitle}</span>
            {article.author && (
              <>
                <span className="text-muted-foreground/40">&middot;</span>
                <span>{article.author}</span>
              </>
            )}
            {(article.publishedAt ?? article.createdAt) && (
              <>
                <span className="text-muted-foreground/40">&middot;</span>
                <span>
                  {formatDistanceToNow(new Date(article.publishedAt ?? article.createdAt!), {
                    addSuffix: true,
                  })}
                </span>
              </>
            )}
            {readingTime > 0 && (
              <>
                <span className="text-muted-foreground/40">&middot;</span>
                <span>{readingTime} min read</span>
              </>
            )}
          </div>

          {/* Title */}
          <h1 className="text-2xl sm:text-3xl font-semibold leading-tight tracking-tight mb-4">
            {article.title}
          </h1>

          {/* Importance + AI summary */}
          {importance && (
            <div className="mb-4 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider px-2 py-1 rounded-md bg-muted">
              <span
                className={cn(
                  "size-2 rounded-full",
                  importance === "high" && "bg-red-500",
                  importance === "med" && "bg-amber-500",
                  importance === "low" && "bg-muted-foreground/40",
                )}
              />
              <span className="font-medium text-muted-foreground">
                {importance === "high"
                  ? "High importance"
                  : importance === "med"
                    ? "Medium"
                    : "Low"}
              </span>
            </div>
          )}

          {(aiSummary || summarizing) && (
            <div className="mb-6 rounded-md border border-primary/20 bg-primary/5 px-4 py-3">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-primary/80 font-medium mb-1.5">
                <Sparkles className="size-3" />
                AI summary
              </div>
              {summarizing && !aiSummary ? (
                <p className="text-sm text-muted-foreground">Summarising…</p>
              ) : (
                <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                  {aiSummary}
                </p>
              )}
            </div>
          )}

          {currentTags.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              {currentTags.map((t) => (
                <span
                  key={t.id}
                  className="group/tag inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-foreground"
                >
                  <Tag className="size-3 text-muted-foreground" />
                  {t.name}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(t.id)}
                    title="Remove tag"
                    className="text-muted-foreground/60 hover:text-destructive transition-colors"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {tagSuggestions && tagSuggestions.length > 0 && (
            <div className="mb-6 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mr-1">
                Suggested tags:
              </span>
              {tagSuggestions.map((s) => {
                const accepted = acceptedTagNames.has(s.name);
                return (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => !accepted && handleAcceptTag(s)}
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full transition-colors",
                      accepted
                        ? "bg-primary/20 text-primary cursor-default"
                        : "bg-muted text-foreground hover:bg-primary/10 hover:text-primary",
                    )}
                    disabled={accepted}
                  >
                    {accepted ? "✓ " : "+ "}
                    {s.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Body */}
          {article.contentHtml ? (
            <div
              className="article-content"
              dangerouslySetInnerHTML={{ __html: proxyImagesInHtml(sanitize(article.contentHtml)) }}
            />
          ) : (
            <p className="text-muted-foreground text-sm">No content available.</p>
          )}

          {/* Bottom spacer */}
          <div className="h-16" />
        </div>
      </div>
    </div>
  );
}

function sanitize(html: string): string {
  if (typeof window === "undefined") return html;
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["target", "allow", "allowfullscreen"],
    FORBID_TAGS: ["form", "object", "embed"],
  });
}
