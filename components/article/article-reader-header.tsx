"use client";

import {
  ArrowLeft,
  CheckCheck,
  Copy,
  Ellipsis,
  ExternalLink,
  FileText,
  Loader2,
  Sparkles,
  Star,
  Tag,
} from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type ContentDisplayMode = "original" | "full";

function ActionButton({
  onClick,
  title,
  children,
  className,
  disabled,
  pressed,
}: {
  onClick?: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      disabled={disabled}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-md outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 md:size-8",
        className,
      )}
    >
      {children}
    </button>
  );
}

export interface ArticleReaderHeaderProps {
  articleId: string;
  url: string | null;
  isRead: boolean;
  isStarred: boolean;
  scrollProgress: number;
  contextLabel?: string;
  hasFullContent: boolean;
  contentMode: ContentDisplayMode;
  onContentModeChange: (mode: ContentDisplayMode) => void;
  fetchingFullContent: boolean;
  onFetchFullContent: () => void;
  hasAiSummary: boolean;
  summarizing: boolean;
  onSummarize: () => void;
  suggestingTags: boolean;
  onSuggestTags: () => void;
  onMarkRead: (id: string, read: boolean) => void;
  onStar: (id: string, starred: boolean) => void;
  onBack?: () => void;
  onCopyUrl: () => void;
  onOpenOriginal: () => void;
}

export function ArticleReaderHeader({
  articleId,
  url,
  isRead,
  isStarred,
  scrollProgress,
  contextLabel,
  hasFullContent,
  contentMode,
  onContentModeChange,
  fetchingFullContent,
  onFetchFullContent,
  hasAiSummary,
  summarizing,
  onSummarize,
  suggestingTags,
  onSuggestTags,
  onMarkRead,
  onStar,
  onBack,
  onCopyUrl,
  onOpenOriginal,
}: ArticleReaderHeaderProps) {
  return (
    <>
      <div className="scroll-progress" style={{ width: `${scrollProgress * 100}%` }} />

      <div className="flex min-h-11 shrink-0 items-center gap-0.5 border-b border-border/50 px-1 md:px-3 md:py-1.5">
        <div className="flex min-w-0 items-center gap-0.5">
          <SidebarTrigger className="size-11 md:hidden" />
          {onBack && (
            <ActionButton title="返回文章列表" onClick={onBack}>
              <ArrowLeft className="size-4 text-muted-foreground" />
            </ActionButton>
          )}
          {contextLabel && (
            <span className="ml-1 hidden max-w-[160px] truncate text-xs text-muted-foreground md:inline-block">
              {contextLabel}
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1">
          {hasFullContent && (
            <div
              role="group"
              aria-label="正文版本切换"
              className="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/50 p-0.5"
            >
              {(["original", "full"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={contentMode === mode}
                  onClick={() => onContentModeChange(mode)}
                  className={cn(
                    "inline-flex h-7 items-center rounded px-2 text-xs transition-colors",
                    contentMode === mode
                      ? "bg-background font-medium text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {mode === "original" ? "原文" : "全文"}
                </button>
              ))}
            </div>
          )}

          {url && (
            <button
              type="button"
              onClick={onFetchFullContent}
              disabled={fetchingFullContent}
              title="抓取全文"
              aria-label="抓取全文"
              className="hidden h-8 items-center gap-1.5 rounded-md border border-border px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50 md:inline-flex"
            >
              {fetchingFullContent ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <FileText className="size-3.5" aria-hidden="true" />
              )}
              <span>{fetchingFullContent ? "抓取中…" : "抓取全文"}</span>
            </button>
          )}

          <ActionButton
            title={isRead ? "标为未读" : "标为已读"}
            pressed={isRead}
            onClick={() => onMarkRead(articleId, !isRead)}
          >
            <CheckCheck
              className={cn("size-4", isRead ? "text-primary" : "text-muted-foreground")}
            />
          </ActionButton>

          <ActionButton
            title={isStarred ? "取消收藏" : "收藏文章"}
            pressed={isStarred}
            onClick={() => onStar(articleId, !isStarred)}
          >
            <Star
              className={cn(
                "size-4",
                isStarred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground",
              )}
            />
          </ActionButton>

          <div className="hidden items-center gap-0.5 md:flex">
            {url && (
              <>
                <ActionButton title="复制链接" onClick={onCopyUrl}>
                  <Copy className="size-4 text-muted-foreground" />
                </ActionButton>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="打开原文"
                  aria-label="打开原文"
                  className="inline-flex size-8 items-center justify-center rounded-md outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <ExternalLink className="size-4 text-muted-foreground" />
                </a>
              </>
            )}
            <div className="mx-1 h-5 w-px bg-border/60" aria-hidden="true" />
            <ActionButton
              title={hasAiSummary ? "重新生成摘要" : "AI 摘要"}
              onClick={onSummarize}
              disabled={summarizing}
            >
              <Sparkles
                className={cn(
                  "size-4",
                  summarizing
                    ? "animate-pulse text-primary"
                    : hasAiSummary
                      ? "text-primary"
                      : "text-muted-foreground",
                )}
              />
            </ActionButton>
            <ActionButton title="AI 推荐标签" onClick={onSuggestTags} disabled={suggestingTags}>
              <Tag
                className={cn(
                  "size-4",
                  suggestingTags ? "animate-pulse text-primary" : "text-muted-foreground",
                )}
              />
            </ActionButton>
          </div>

          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<button type="button" aria-label="更多操作" />}
                className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Ellipsis className="size-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52 rounded-md">
                {url && (
                  <>
                    <DropdownMenuItem
                      className="min-h-11 px-3"
                      onClick={onFetchFullContent}
                      disabled={fetchingFullContent}
                    >
                      <FileText className="size-4" />
                      {fetchingFullContent ? "正在抓取全文…" : "抓取全文"}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="min-h-11 px-3" onClick={onCopyUrl}>
                      <Copy className="size-4" />
                      复制链接
                    </DropdownMenuItem>
                    <DropdownMenuItem className="min-h-11 px-3" onClick={onOpenOriginal}>
                      <ExternalLink className="size-4" />
                      打开原文
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  className="min-h-11 px-3"
                  onClick={onSummarize}
                  disabled={summarizing}
                >
                  <Sparkles className="size-4" />
                  {summarizing ? "正在生成摘要…" : hasAiSummary ? "重新生成摘要" : "AI 摘要"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11 px-3"
                  onClick={onSuggestTags}
                  disabled={suggestingTags}
                >
                  <Tag className="size-4" />
                  {suggestingTags ? "正在推荐标签…" : "AI 推荐标签"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </>
  );
}
