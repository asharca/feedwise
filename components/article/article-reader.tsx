"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import DOMPurify from "dompurify";
import { ExternalLink, Star, CheckCheck, BookOpen, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

function proxyImagesInHtml(html: string): string {
  return html.replace(
    /(<img\b[^>]*?\ssrc=)(["'])(https?:\/\/[^"']+)\2/gi,
    (_, prefix, quote, url) =>
      `${prefix}${quote}/api/image-proxy?url=${encodeURIComponent(url)}${quote}`
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
  publishedAt: Date | null;
  isRead: boolean;
  isStarred: boolean;
}

interface ArticleReaderProps {
  article: ArticleDetail | null;
  onMarkRead: (id: string, read: boolean) => void;
  onStar: (id: string, starred: boolean) => void;
  onBack?: () => void;
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
        "size-8 inline-flex items-center justify-center rounded-xl hover:bg-accent transition-colors",
        className
      )}
    >
      {children}
    </button>
  );
}

export function ArticleReader({ article, onMarkRead, onStar, onBack }: ArticleReaderProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const max = scrollHeight - clientHeight;
    setScrollProgress(max > 0 ? scrollTop / max : 0);
  }, []);

  useEffect(() => {
    setScrollProgress(0);
  }, [article?.id]);

  if (!article) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <div className="size-16 rounded-2xl bg-muted/50 flex items-center justify-center">
          <BookOpen className="size-7 text-muted-foreground/30" />
        </div>
        <p className="text-sm">Select an article to read</p>
      </div>
    );
  }

  const readingTime = estimateReadingTime(article.contentText ?? article.contentHtml);

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* Scroll progress */}
      <div
        className="scroll-progress"
        style={{ width: `${scrollProgress * 100}%` }}
      />

      {/* Action bar */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 shrink-0 border-b border-border/50">
        {onBack && (
          <ActionButton title="Back" onClick={onBack}>
            <ArrowLeft className="size-4 text-muted-foreground" />
          </ActionButton>
        )}
        <ActionButton
          title={article.isRead ? "Mark unread" : "Mark read"}
          onClick={() => onMarkRead(article.id, !article.isRead)}
        >
          <CheckCheck
            className={cn(
              "size-4",
              article.isRead ? "text-primary" : "text-muted-foreground"
            )}
          />
        </ActionButton>

        <ActionButton
          title={article.isStarred ? "Unstar" : "Star"}
          onClick={() => onStar(article.id, !article.isStarred)}
        >
          <Star
            className={cn(
              "size-4",
              article.isStarred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
            )}
          />
        </ActionButton>

        {article.url && (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open original"
            className="size-8 inline-flex items-center justify-center rounded-xl hover:bg-accent transition-colors"
          >
            <ExternalLink className="size-4 text-muted-foreground" />
          </a>
        )}
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
            {article.publishedAt && (
              <>
                <span className="text-muted-foreground/40">&middot;</span>
                <span>
                  {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}
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
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight tracking-tight mb-8">
            {article.title}
          </h1>

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
