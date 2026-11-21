"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { zhCN } from "date-fns/locale";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { CONTENT_VIEWS, type ContentView } from "@/lib/db/schema-types";
import { apiFetch } from "@/lib/query/api";
import { queryKeys } from "@/lib/query/keys";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  CONTENT_VIEW_LABELS,
  formatFetchInterval,
  formatHtmlDisplayUrl,
  getSourceTypeLabel,
} from "./content-view-meta";
import type { Folder, Subscription } from "./types";

export interface FeedSettingsDialogProps {
  open: boolean;
  target: Subscription | null;
  folders: Folder[];
  onOpenChange: (open: boolean) => void;
}

interface PatchFeedPayload {
  customTitle?: string;
  feedUrl?: string;
  folderId?: string | null;
  view?: ContentView | null;
  fetchFullText?: boolean;
}

const AUTO_VIEW = "__auto__";
const NO_FOLDER = "__none__";

function formatNextFetch(nextFetchAt: string | Date | null | undefined): string {
  if (!nextFetchAt) return "待调度";
  const date = nextFetchAt instanceof Date ? nextFetchAt : new Date(nextFetchAt);
  if (Number.isNaN(date.getTime())) return "待调度";
  const relative = formatDistanceToNowStrict(date, { addSuffix: true, locale: zhCN });
  return `${relative}（${date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}）`;
}

export function FeedSettingsDialog({
  open,
  target,
  folders,
  onOpenChange,
}: FeedSettingsDialogProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [folderId, setFolderId] = useState<string>(NO_FOLDER);
  const [view, setView] = useState<string>(AUTO_VIEW);
  const [fetchFullText, setFetchFullText] = useState(false);

  const isHtmlSource = target?.sourceType === "html";
  const detectedView: ContentView = target?.defaultView ?? "article";

  const saveMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PatchFeedPayload }) =>
      apiFetch<unknown>(`/api/feeds/${id}`, {
        method: "PATCH",
        json: payload,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.articles.all });
      toast.success("已保存订阅设置");
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (!open || !target) return;
    setTitle(target.title ?? "");
    setFeedUrl(target.url ?? "");
    setFolderId(target.folderId ?? NO_FOLDER);
    setView(target.viewOverride ?? AUTO_VIEW);
    setFetchFullText(Boolean(target.fetchFullText));
    saveMutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset form when opening for a target
  }, [open, target?.id]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;

    const payload: PatchFeedPayload = {
      customTitle: title.trim(),
      folderId: folderId === NO_FOLDER ? null : folderId,
      view: view === AUTO_VIEW ? null : (view as ContentView),
      fetchFullText,
    };

    const trimmedUrl = feedUrl.trim();
    if (!isHtmlSource && trimmedUrl && trimmedUrl !== target.url) {
      payload.feedUrl = trimmedUrl;
    }

    saveMutation.mutate({ id: target.id, payload });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-lg">
        <DialogHeader>
          <DialogTitle>订阅设置</DialogTitle>
        </DialogHeader>
        {target && (
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="feed-settings-title">名称</Label>
              <Input
                id="feed-settings-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={target.feedTitle ?? "默认使用源标题"}
                className="rounded-md"
              />
            </div>

            {isHtmlSource ? (
              <div className="space-y-1.5">
                <Label>抓取页面</Label>
                <p className="truncate rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {formatHtmlDisplayUrl(target.url, target.siteUrl)}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="feed-settings-url">订阅地址</Label>
                <Input
                  id="feed-settings-url"
                  type="url"
                  required
                  value={feedUrl}
                  onChange={(e) => setFeedUrl(e.target.value)}
                  placeholder="https://example.com/feed.xml"
                  className="rounded-md"
                />
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="feed-settings-folder">文件夹</Label>
                <select
                  id="feed-settings-folder"
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value={NO_FOLDER}>未分类</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="feed-settings-view">显示方式</Label>
                <select
                  id="feed-settings-view"
                  value={view}
                  onChange={(e) => setView(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value={AUTO_VIEW}>自动（{CONTENT_VIEW_LABELS[detectedView]}）</option>
                  {CONTENT_VIEWS.map((v) => (
                    <option key={v} value={v}>
                      {CONTENT_VIEW_LABELS[v]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2.5">
              <div className="space-y-0.5">
                <Label htmlFor="feed-settings-fulltext" className="cursor-pointer text-sm">
                  自动抓取全文
                </Label>
                <p className="text-xs text-muted-foreground">
                  新文章入库后自动在后台提取原网页正文
                </p>
              </div>
              <Switch
                id="feed-settings-fulltext"
                checked={fetchFullText}
                onCheckedChange={setFetchFullText}
              />
            </div>

            <dl className="space-y-1.5 rounded-md border border-border/60 bg-muted/30 px-3 py-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">来源类型</dt>
                <dd className="font-medium text-foreground">
                  {getSourceTypeLabel(target.sourceType)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">当前抓取间隔</dt>
                <dd className="tabular-nums text-foreground">
                  {formatFetchInterval(target.fetchIntervalMinutes)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">下次抓取时间</dt>
                <dd className="tabular-nums text-foreground">
                  {formatNextFetch(target.nextFetchAt)}
                </dd>
              </div>
              {target.lastFetchError && (
                <div className="mt-2 flex items-start gap-1.5 border-t border-border/60 pt-2 text-destructive">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1 break-words">
                    <span className="font-medium">最近错误：</span>
                    {target.lastFetchError}
                    {(target.consecutiveFailures ?? 0) > 1 && (
                      <span>（连续失败 {target.consecutiveFailures} 次）</span>
                    )}
                  </div>
                </div>
              )}
            </dl>

            {saveMutation.error && (
              <p role="alert" className="text-sm text-destructive">
                {saveMutation.error instanceof Error
                  ? saveMutation.error.message
                  : "保存失败，请稍后重试"}
              </p>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={saveMutation.isPending} className="flex-1 rounded-md">
                {saveMutation.isPending ? "保存中…" : "保存"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-md"
                onClick={() => onOpenChange(false)}
              >
                取消
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
