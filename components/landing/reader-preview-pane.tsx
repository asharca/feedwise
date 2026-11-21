import { Bell, CheckCheck, ExternalLink, FileText, Sparkles, Star, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PreviewArticle } from "./reader-preview-data";

interface ReaderPreviewPaneProps {
  article: PreviewArticle;
  visibleOnMobile: boolean;
}

export function ReaderPreviewPane({ article, visibleOnMobile }: ReaderPreviewPaneProps) {
  return (
    <div
      className={cn(
        "relative flex-col bg-background text-left md:flex",
        visibleOnMobile ? "flex" : "hidden",
      )}
    >
      <div className="h-[2px] w-2/5 bg-primary" aria-hidden="true" />

      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
        <span className="truncate text-xs text-muted-foreground">{article.feedTitle}</span>
        <div className="flex items-center gap-2 text-muted-foreground" aria-hidden="true">
          <CheckCheck className="size-3.5 text-primary" />
          <Star className={cn("size-3.5", article.starred && "fill-primary text-primary")} />
          <FileText className="size-3.5" />
          <Sparkles className="size-3.5 text-primary" />
          <ExternalLink className="size-3.5" />
        </div>
      </div>

      <div className="flex-1 space-y-3.5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/85">{article.feedTitle}</span>
          <span aria-hidden="true">·</span>
          <span>{article.author}</span>
          <span aria-hidden="true">·</span>
          <span>{article.timeAgo}</span>
          <span aria-hidden="true">·</span>
          <span>约 {article.readingMinutes} 分钟</span>
        </div>

        <p className="text-lg font-semibold leading-snug tracking-tight text-foreground sm:text-xl">
          {article.title}
        </p>

        {article.ruleBadge && (
          <div className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-foreground">
            <Bell className="size-3 text-primary" aria-hidden="true" />
            <span>{article.ruleBadge}</span>
          </div>
        )}

        <div className="rounded-md border border-primary/20 bg-primary/5 px-3.5 py-2.5">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-primary">
            <Sparkles className="size-3" aria-hidden="true" />
            <span>AI 摘要（可选）</span>
          </div>
          <p className="text-xs leading-relaxed text-foreground/90 sm:text-[13px]">
            {article.aiSummary}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {article.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground"
            >
              <Tag className="size-2.5 text-muted-foreground" aria-hidden="true" />
              {tag}
            </span>
          ))}
        </div>

        <div className="space-y-2.5 pt-1 text-[13px] leading-7 text-foreground/90 sm:text-sm">
          {article.paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
