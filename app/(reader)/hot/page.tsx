"use client";

import { useState } from "react";
import { Flame } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Segmented } from "@/components/ui/segmented";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HotBoardCard, HotBoardsSkeleton } from "@/components/hot/hot-board-card";
import { HotTrends } from "@/components/hot/hot-trends";
import { useHot, type HotCategory } from "@/lib/hooks/use-hot";

const categories: Array<{ value: HotCategory | "all"; label: string }> = [
  { value: "all", label: "全部" },
  { value: "news", label: "新闻" },
  { value: "tech", label: "科技" },
  { value: "community", label: "社区" },
  { value: "entertainment", label: "娱乐" },
];

export default function HotPage() {
  const [category, setCategory] = useState<HotCategory | "all">("all");
  const { boards, trending, reload } = useHot(category);

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border/60 px-4">
          <SidebarTrigger className="size-11 md:hidden" />
          <Flame aria-hidden="true" className="size-4 text-orange-600 dark:text-orange-400" />
          <h1 className="text-base font-semibold">热榜</h1>
          <span className="ml-auto hidden text-xs text-muted-foreground sm:block">
            聚合热门话题 · 每 5 分钟自动更新
          </span>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <div className="space-y-5 p-4 md:p-6">
            <HotTrends
              data={trending.data}
              loading={trending.loading}
              error={trending.error}
              onRetry={trending.reload}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Segmented
                value={category}
                options={categories}
                onChange={setCategory}
                aria-label="热榜分类"
              />
              <span aria-live="polite" className="text-xs text-muted-foreground">
                {boards.loading ? "正在更新榜单…" : `${boards.data?.boards.length ?? 0} 个来源`}
              </span>
            </div>
            {boards.error && (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-3 rounded-lg border p-4 text-sm text-muted-foreground"
              >
                <span>
                  热榜加载失败：{boards.error}
                  {boards.data ? "，当前显示上次加载的榜单。" : ""}
                </span>
                <Button variant="outline" size="sm" onClick={boards.reload}>
                  重新加载
                </Button>
              </div>
            )}
            {!boards.data && boards.loading ? (
              <HotBoardsSkeleton />
            ) : (
              boards.data &&
              (boards.data.boards.length ? (
                <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {boards.data.boards.map((board) => (
                    <HotBoardCard key={board.source.key} board={board} onRefresh={reload} />
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border bg-card px-4 py-16 text-center text-sm text-muted-foreground">
                  此分类暂无热榜来源
                </p>
              ))
            )}
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
