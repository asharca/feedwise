"use client";

import { Sparkles, Tag, X } from "lucide-react";
import type { TagSuggestion } from "@/lib/reader/types";
import { cn } from "@/lib/utils";

interface ArticleSummaryPanelProps {
  importance: "high" | "med" | "low" | null;
  aiSummary: string | null;
  summarizing: boolean;
  tags: Array<{ id: string; name: string }>;
  tagSuggestions: TagSuggestion[] | null;
  acceptedTagNames: ReadonlySet<string>;
  onAcceptTag: (suggestion: TagSuggestion) => void;
  onRemoveTag: (tagId: string) => void;
}

/** Displays importance badge, AI summary card, current tags, and AI tag suggestions. */
export function ArticleSummaryPanel({
  importance,
  aiSummary,
  summarizing,
  tags,
  tagSuggestions,
  acceptedTagNames,
  onAcceptTag,
  onRemoveTag,
}: ArticleSummaryPanelProps) {
  return (
    <>
      {importance && (
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[11px] uppercase tracking-wider">
          <span
            className={cn(
              "size-2 rounded-full",
              importance === "high" && "bg-red-500",
              importance === "med" && "bg-amber-500",
              importance === "low" && "bg-muted-foreground/40",
            )}
          />
          <span className="font-medium text-muted-foreground">
            {importance === "high" ? "高重要度" : importance === "med" ? "中重要度" : "低重要度"}
          </span>
        </div>
      )}

      {(aiSummary || summarizing) && (
        <div className="mb-6 rounded-md border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-primary/80">
            <Sparkles className="size-3" />
            AI 摘要
          </div>
          {summarizing && !aiSummary ? (
            <p className="text-sm text-muted-foreground">正在生成摘要…</p>
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {aiSummary}
            </p>
          )}
        </div>
      )}

      {tags.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <span
              key={t.id}
              className="group/tag inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground"
            >
              <Tag className="size-3 text-muted-foreground" />
              {t.name}
              <button
                type="button"
                onClick={() => onRemoveTag(t.id)}
                title="移除标签"
                aria-label="移除标签"
                className="text-muted-foreground/60 transition-colors hover:text-destructive"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {tagSuggestions && tagSuggestions.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            推荐标签：
          </span>
          {tagSuggestions.map((s) => {
            const accepted = acceptedTagNames.has(s.name);
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => !accepted && onAcceptTag(s)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs transition-colors",
                  accepted
                    ? "cursor-default bg-primary/20 text-primary"
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
    </>
  );
}
