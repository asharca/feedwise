"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw,
  Download,
  Upload,
  Clock,
  Trash2,
  Sparkles,
  FolderTree,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionErrorState, SectionLoadingState } from "@/components/settings/section-state";
import { downloadOpmlExport } from "@/components/settings/api-helpers";
import type { Sub } from "@/components/settings/types";
import { apiFetch } from "@/lib/query/api";
import { queryKeys } from "@/lib/query/keys";
import { cn } from "@/lib/utils";

interface ProposedFolder {
  name: string;
  feedIds: string[];
}

const INTERVAL_OPTIONS = [
  { value: 15, label: "15 分钟" },
  { value: 30, label: "30 分钟" },
  { value: 60, label: "1 小时" },
  { value: 120, label: "2 小时" },
  { value: 360, label: "6 小时" },
  { value: 720, label: "12 小时" },
  { value: 1440, label: "24 小时" },
];

export function FeedsSection() {
  const queryClient = useQueryClient();
  const [groupOpen, setGroupOpen] = useState(false);

  const feedsQuery = useQuery({
    queryKey: queryKeys.feeds.list(),
    queryFn: () => apiFetch<Sub[]>("/api/feeds"),
  });

  const syncAllMutation = useMutation({
    mutationFn: () => apiFetch<{ synced: number }>("/api/feeds/sync", { method: "POST" }),
    onSuccess: () => {
      toast.success("已开始同步全部订阅源");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "启动订阅同步失败");
    },
  });

  const exportOpmlMutation = useMutation({
    mutationFn: downloadOpmlExport,
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "导出 OPML 失败");
    },
  });

  const importOpmlMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiFetch<{ imported: number; failed: number; total: number }>("/api/opml/import", {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: (res) => {
      toast.success(`已导入 ${res.imported} 个订阅源`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "导入 OPML 失败");
    },
  });

  const intervalMutation = useMutation({
    mutationFn: ({ subId, minutes }: { subId: string; minutes: number }) =>
      apiFetch(`/api/feeds/${subId}`, {
        method: "PATCH",
        json: { fetchIntervalMinutes: minutes },
      }),
    onSuccess: (_data, { subId, minutes }) => {
      queryClient.setQueryData<Sub[]>(queryKeys.feeds.list(), (prev) =>
        prev?.map((s) => (s.id === subId ? { ...s, fetchIntervalMinutes: minutes } : s)),
      );
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "更新刷新间隔失败");
    },
  });

  const deleteFeedMutation = useMutation({
    mutationFn: (subId: string) => apiFetch(`/api/feeds/${subId}`, { method: "DELETE" }),
    onSuccess: (_data, subId) => {
      queryClient.setQueryData<Sub[]>(queryKeys.feeds.list(), (prev) =>
        prev?.filter((s) => s.id !== subId),
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.articles.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      toast.success("已取消订阅");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "取消订阅失败");
    },
  });

  const autoGroupMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ folders: ProposedFolder[] }>("/api/feeds/auto-group", { method: "POST" }),
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "AI 自动分组失败");
      setGroupOpen(false);
    },
  });

  const applyGroupMutation = useMutation({
    mutationFn: (folders: ProposedFolder[]) =>
      apiFetch<{ foldersTouched: number; subscriptionsMoved: number }>(
        "/api/feeds/auto-group/apply",
        { method: "POST", json: { folders } },
      ),
    onSuccess: (res) => {
      toast.success(`已将 ${res.subscriptionsMoved} 个订阅源整理至 ${res.foldersTouched} 个文件夹`);
      setGroupOpen(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "应用分组方案失败");
    },
  });

  function handleImportOPML() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".opml,.xml";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      importOpmlMutation.mutate(file);
    };
    input.click();
  }

  function handleDeleteFeed(sub: Sub) {
    const label = sub.title ?? sub.feedTitle ?? sub.url;
    if (!window.confirm(`确定要取消订阅「${label}」吗？`)) return;
    deleteFeedMutation.mutate(sub.id);
  }

  function handleAutoGroup() {
    autoGroupMutation.reset();
    setGroupOpen(true);
    autoGroupMutation.mutate();
  }

  if (feedsQuery.isPending) {
    return <SectionLoadingState label="订阅源" />;
  }

  if (feedsQuery.isError) {
    return (
      <SectionErrorState
        label="订阅源"
        error={feedsQuery.error}
        onRetry={() => void feedsQuery.refetch()}
      />
    );
  }

  const subs = feedsQuery.data ?? [];
  const proposal = autoGroupMutation.data?.folders ?? null;
  const subByFeedId = new Map(subs.map((s) => [s.feedId, s]));
  const totalFeedsInProposal = proposal?.reduce((sum, f) => sum + f.feedIds.length, 0) ?? 0;
  const uncoveredCount = proposal !== null ? Math.max(0, subs.length - totalFeedsInProposal) : 0;

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-base">订阅源管理</CardTitle>
        <CardDescription>管理你的 RSS 与网页订阅源、刷新频率及 OPML 导入导出</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="rounded-md"
            onClick={() => syncAllMutation.mutate()}
            disabled={syncAllMutation.isPending}
          >
            <RefreshCw className={cn("size-4", syncAllMutation.isPending && "animate-spin")} />
            {syncAllMutation.isPending ? "同步中…" : "全部同步"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-md"
            onClick={handleImportOPML}
            disabled={importOpmlMutation.isPending}
          >
            <Download className="size-4" />
            {importOpmlMutation.isPending ? "导入中…" : "导入 OPML"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-md"
            onClick={() => exportOpmlMutation.mutate()}
            disabled={exportOpmlMutation.isPending}
          >
            <Upload className="size-4" />
            导出 OPML
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-md"
            onClick={handleAutoGroup}
            disabled={subs.length === 0 || autoGroupMutation.isPending}
            title="使用 AI 将订阅源按主题整理到文件夹"
          >
            <Sparkles className="size-4" />
            AI 智能分组
          </Button>
        </div>

        {subs.length > 0 ? (
          <div className="border border-border rounded-md divide-y divide-border overflow-y-auto scrollbar-thin max-h-96">
            {subs.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/30 transition-colors"
              >
                {sub.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={sub.iconUrl}
                    alt=""
                    loading="lazy"
                    className="size-4 rounded-sm shrink-0"
                  />
                ) : (
                  <div className="size-4 rounded-sm bg-muted shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {sub.title ?? sub.feedTitle ?? sub.url}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">{sub.url}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Clock className="size-3.5 text-muted-foreground" />
                  <select
                    aria-label={`${sub.title ?? sub.feedTitle ?? sub.url} 刷新间隔`}
                    value={sub.fetchIntervalMinutes ?? 60}
                    onChange={(e) =>
                      intervalMutation.mutate({
                        subId: sub.id,
                        minutes: Number(e.target.value),
                      })
                    }
                    className="h-8 cursor-pointer rounded-md border border-input bg-muted px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {INTERVAL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => handleDeleteFeed(sub)}
                  disabled={deleteFeedMutation.isPending}
                  aria-label={`取消订阅 ${sub.title ?? sub.feedTitle ?? sub.url}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">暂无订阅源。</p>
        )}
      </CardContent>

      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent className="!max-w-none rounded-lg w-[min(640px,94vw)] h-[min(76dvh,640px)] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-6">
              <FolderTree className="size-4" />
              <span>AI 分组建议</span>
              {proposal && (
                <span className="text-xs font-normal text-muted-foreground tabular-nums">
                  {totalFeedsInProposal}/{subs.length} 个订阅源
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
            {autoGroupMutation.isPending || !proposal ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-12">
                <Loader2 className="size-5 animate-spin" />
                <p className="text-sm">正在分析订阅源主题…</p>
                <p className="text-[11px] text-muted-foreground/70">通常需要几秒钟。</p>
              </div>
            ) : proposal.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-12">
                <p className="text-sm">模型未返回分组建议。</p>
                <p className="text-[11px] text-muted-foreground/70">
                  请稍后重试，或添加更多订阅源后再运行。
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-3">
                {proposal.map((folder) => (
                  <div key={folder.name} className="rounded-md border border-border bg-card">
                    <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                      <div className="text-sm font-semibold tracking-tight">{folder.name}</div>
                      <div className="text-[11px] tabular-nums text-muted-foreground">
                        {folder.feedIds.length} 个订阅源
                      </div>
                    </div>
                    <ul className="divide-y divide-border">
                      {folder.feedIds.map((feedId) => {
                        const sub = subByFeedId.get(feedId);
                        return (
                          <li key={feedId} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                            {sub?.iconUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={sub.iconUrl}
                                alt=""
                                loading="lazy"
                                decoding="sync"
                                className="size-4 rounded-sm shrink-0"
                              />
                            ) : (
                              <div className="size-4 rounded-sm bg-muted shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="truncate">
                                {sub?.title ?? sub?.feedTitle ?? feedId}
                              </div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {sub?.url ?? ""}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
                {uncoveredCount > 0 && (
                  <p className="text-[11px] text-muted-foreground px-1">
                    未出现在建议中的 {uncoveredCount} 个订阅源将保留在原文件夹。
                  </p>
                )}
              </div>
            )}
          </div>

          {proposal && proposal.length > 0 && (
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
              <p className="text-[11px] text-muted-foreground">
                同名文件夹将被复用，应用方案不会删除任何订阅。
              </p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-md"
                  onClick={() => setGroupOpen(false)}
                  disabled={applyGroupMutation.isPending}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  className="rounded-md"
                  onClick={() => applyGroupMutation.mutate(proposal)}
                  disabled={applyGroupMutation.isPending}
                >
                  {applyGroupMutation.isPending ? "应用中…" : "应用分组"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
