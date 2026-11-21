"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { PREVIEW_ARTICLES } from "./reader-preview-data";
import { ReaderPreviewPane } from "./reader-preview-pane";
import { ReaderPreviewSidebar } from "./reader-preview-sidebar";

export function ReaderPreview() {
  const [selectedId, setSelectedId] = useState(PREVIEW_ARTICLES[0].id);
  const [mobilePane, setMobilePane] = useState<"list" | "reader">("reader");

  const activeArticle =
    PREVIEW_ARTICLES.find((article) => article.id === selectedId) ?? PREVIEW_ARTICLES[0];

  function handleSelectArticle(id: string) {
    setSelectedId(id);
    setMobilePane("reader");
  }

  return (
    <div
      role="region"
      aria-label="Feedwise 三栏阅读器界面预览"
      className="overflow-hidden rounded-xl border border-border bg-card shadow-lg shadow-black/5 dark:shadow-black/35"
    >
      {/* Window chrome */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-sidebar px-3.5 py-2.5">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
        </div>
        <div className="min-w-0 truncate rounded-md border border-border/70 bg-background px-3 py-0.5 font-mono text-[11px] text-muted-foreground">
          feedwise.yourdomain.com/reader
        </div>
        <div className="hidden items-center gap-1.5 font-mono text-[11px] text-muted-foreground sm:flex">
          <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px]">
            J/K
          </kbd>
          <span>切换</span>
          <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px]">
            S
          </kbd>
          <span>收藏</span>
        </div>
      </div>

      {/* Mobile pane switch */}
      <div className="flex items-center gap-1 border-b border-border bg-muted/40 p-1.5 md:hidden">
        <button
          type="button"
          onClick={() => setMobilePane("list")}
          aria-pressed={mobilePane === "list"}
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            mobilePane === "list"
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          文章列表 ({PREVIEW_ARTICLES.length})
        </button>
        <button
          type="button"
          onClick={() => setMobilePane("reader")}
          aria-pressed={mobilePane === "reader"}
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            mobilePane === "reader"
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          正文阅读
        </button>
      </div>

      {/* Three-pane reader shell */}
      <div className="grid min-h-[430px] grid-cols-1 md:grid-cols-[270px_1fr] lg:grid-cols-[204px_280px_1fr]">
        <ReaderPreviewSidebar />

        {/* Pane 2: Article List */}
        <div
          className={cn(
            "flex-col border-border bg-background text-left md:flex md:border-r",
            mobilePane === "list" ? "flex" : "hidden",
          )}
        >
          <div className="flex items-center justify-between border-b border-border/70 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">全部未读</span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                18
              </span>
            </div>
            <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
              <Search className="size-3" aria-hidden="true" />
              中文检索
            </span>
          </div>

          <ul className="divide-y divide-border/50 p-1.5" aria-label="示例文章列表">
            {PREVIEW_ARTICLES.map((item) => {
              const active = item.id === activeArticle.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectArticle(item.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "block w-full rounded-md px-2.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active ? "bg-primary/10" : "hover:bg-accent/60",
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="truncate">{item.feedTitle}</span>
                      <span className="shrink-0">{item.timeAgo}</span>
                    </div>
                    <p
                      className={cn(
                        "line-clamp-2 text-[13px] font-semibold leading-snug",
                        !item.unread && !active ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {item.unread && (
                        <span
                          aria-hidden="true"
                          className="mr-1.5 inline-block size-1.5 rounded-full bg-primary align-middle"
                        />
                      )}
                      {item.title}
                    </p>
                    <p className="mt-1 line-clamp-1 text-[11px] leading-relaxed text-muted-foreground">
                      {item.excerpt}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Pane 3: Reading Pane */}
        <ReaderPreviewPane article={activeArticle} visibleOnMobile={mobilePane === "reader"} />
      </div>
    </div>
  );
}
