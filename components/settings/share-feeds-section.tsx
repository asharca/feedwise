"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Rss, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CopyButton,
  SectionErrorState,
  SectionLoadingState,
} from "@/components/settings/section-state";
import {
  CONTENT_VIEW_LABELS,
  type FolderItem,
  type ShareFeedDto,
  type Sub,
  type TagItem,
} from "@/components/settings/types";
import { CONTENT_VIEWS, type ContentView, type ShareFeedFilter } from "@/lib/db/schema-types";
import { apiFetch } from "@/lib/query/api";
import { queryKeys } from "@/lib/query/keys";

const SELECT_CLS =
  "h-9 w-full cursor-pointer rounded-md border border-input bg-muted px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function buildFilterTags(
  filter: ShareFeedFilter,
  feedNames: Map<string, string>,
  folderNames: Map<string, string>,
  tagNames: Map<string, string>,
): string[] {
  const summary: string[] = [];
  if (filter.feedId) {
    summary.push(`订阅源：${feedNames.get(filter.feedId) ?? filter.feedId}`);
  }
  if (filter.folderId) {
    summary.push(`文件夹：${folderNames.get(filter.folderId) ?? filter.folderId}`);
  }
  if (filter.tagId) {
    summary.push(`标签：${tagNames.get(filter.tagId) ?? filter.tagId}`);
  }
  if (filter.starred) {
    summary.push("仅加星");
  }
  if (filter.view) {
    summary.push(`视图：${CONTENT_VIEW_LABELS[filter.view] ?? filter.view}`);
  }
  return summary.length > 0 ? summary : ["全部文章"];
}

function CreateShareFeedForm({
  subs,
  folders,
  tags,
  onClose,
}: {
  subs: Sub[];
  folders: FolderItem[];
  tags: TagItem[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [feedId, setFeedId] = useState("");
  const [folderId, setFolderId] = useState("");
  const [tagId, setTagId] = useState("");
  const [starred, setStarred] = useState(false);
  const [view, setView] = useState<ContentView | "">("");
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; filter: ShareFeedFilter }) =>
      apiFetch<ShareFeedDto>("/api/share-feeds", { method: "POST", json: payload }),
    onSuccess: (created) => {
      queryClient.setQueryData<ShareFeedDto[]>(queryKeys.shareFeeds.all, (prev) =>
        prev ? [created, ...prev] : [created],
      );
      toast.success("已创建 RSS 输出源");
      onClose();
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "创建 RSS 输出源失败");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("请输入输出源名称");
      return;
    }
    const filter: ShareFeedFilter = {};
    if (feedId) filter.feedId = feedId;
    if (folderId) filter.folderId = folderId;
    if (tagId) filter.tagId = tagId;
    if (starred) filter.starred = true;
    if (view) filter.view = view;
    setFormError(null);
    createMutation.mutate({ name: trimmed, filter });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {formError}
        </div>
      )}

      <div className="space-y-1.5">
        <label
          htmlFor="share-feed-name"
          className="text-xs font-medium text-muted-foreground block"
        >
          输出名称
        </label>
        <Input
          id="share-feed-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setFormError(null);
          }}
          placeholder="例如：我的加星精选、AI 资讯汇总"
          maxLength={100}
          className="h-9 bg-muted"
        />
      </div>

      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          以下筛选条件均为可选且取交集；全部留空将输出所有未隐藏的订阅文章（最新 50 篇）。
        </p>

        <div className="space-y-1">
          <label htmlFor="share-feed-sub" className="text-xs text-muted-foreground block">
            限定订阅源
          </label>
          <select
            id="share-feed-sub"
            value={feedId}
            onChange={(e) => setFeedId(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="">不限订阅源</option>
            {subs.map((sub) => (
              <option key={sub.feedId} value={sub.feedId}>
                {sub.title ?? sub.feedTitle ?? sub.url}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="share-feed-folder" className="text-xs text-muted-foreground block">
            限定文件夹
          </label>
          <select
            id="share-feed-folder"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="">不限文件夹</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="share-feed-tag" className="text-xs text-muted-foreground block">
            限定标签
          </label>
          <select
            id="share-feed-tag"
            value={tagId}
            onChange={(e) => setTagId(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="">不限标签</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="share-feed-view" className="text-xs text-muted-foreground block">
            限定内容视图
          </label>
          <select
            id="share-feed-view"
            value={view}
            onChange={(e) => setView(e.target.value as ContentView | "")}
            className={SELECT_CLS}
          >
            <option value="">不限视图</option>
            {CONTENT_VIEWS.map((v) => (
              <option key={v} value={v}>
                {CONTENT_VIEW_LABELS[v]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
          <div>
            <p className="text-sm font-medium">仅包含加星文章</p>
            <p className="text-xs text-muted-foreground">只输出你手动或通过规则收藏的文章</p>
          </div>
          <Switch checked={starred} onCheckedChange={setStarred} aria-label="仅包含加星文章" />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-md"
          onClick={onClose}
          disabled={createMutation.isPending}
        >
          取消
        </Button>
        <Button type="submit" size="sm" className="rounded-md" disabled={createMutation.isPending}>
          {createMutation.isPending ? "创建中…" : "创建输出源"}
        </Button>
      </div>
    </form>
  );
}

export function ShareFeedsSection() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const shareFeedsQuery = useQuery({
    queryKey: queryKeys.shareFeeds.all,
    queryFn: () => apiFetch<ShareFeedDto[]>("/api/share-feeds"),
  });

  const feedsQuery = useQuery({
    queryKey: queryKeys.feeds.list(),
    queryFn: () => apiFetch<Sub[]>("/api/feeds"),
  });

  const foldersQuery = useQuery({
    queryKey: queryKeys.folders.all,
    queryFn: () => apiFetch<FolderItem[]>("/api/folders"),
  });

  const tagsQuery = useQuery({
    queryKey: queryKeys.tags.all,
    queryFn: () => apiFetch<TagItem[]>("/api/tags"),
  });

  const rotateMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<ShareFeedDto>(`/api/share-feeds/${id}/rotate`, { method: "POST" }),
    onSuccess: (updated) => {
      queryClient.setQueryData<ShareFeedDto[]>(queryKeys.shareFeeds.all, (prev) =>
        prev?.map((item) => (item.id === updated.id ? updated : item)),
      );
      toast.success("已重置 RSS 链接，旧链接立即失效");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "重置链接失败");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string }>(`/api/share-feeds/${id}`, { method: "DELETE" }),
    onSuccess: (_res, id) => {
      queryClient.setQueryData<ShareFeedDto[]>(queryKeys.shareFeeds.all, (prev) =>
        prev?.filter((item) => item.id !== id),
      );
      toast.success("已删除 RSS 输出源");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "删除失败");
    },
  });

  if (shareFeedsQuery.isPending) {
    return <SectionLoadingState label="RSS 输出源" />;
  }

  if (shareFeedsQuery.isError) {
    return (
      <SectionErrorState
        label="RSS 输出源"
        error={shareFeedsQuery.error}
        onRetry={() => void shareFeedsQuery.refetch()}
      />
    );
  }

  const shareFeeds = shareFeedsQuery.data ?? [];
  const subs = feedsQuery.data ?? [];
  const folders = foldersQuery.data ?? [];
  const tags = tagsQuery.data ?? [];

  const feedNames = new Map(subs.map((s) => [s.feedId, s.title ?? s.feedTitle ?? s.url]));
  const folderNames = new Map(folders.map((f) => [f.id, f.name]));
  const tagNames = new Map(tags.map((t) => [t.id, t.name]));

  function handleRotate(item: ShareFeedDto) {
    if (!window.confirm(`确定要重置「${item.name}」的公开链接吗？旧链接将立即失效。`)) return;
    rotateMutation.mutate(item.id);
  }

  function handleDelete(item: ShareFeedDto) {
    if (!window.confirm(`确定要删除 RSS 输出源「${item.name}」吗？`)) return;
    deleteMutation.mutate(item.id);
  }

  return (
    <Card className="rounded-lg">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="text-base flex items-center gap-2">
            <Rss className="size-4" />
            RSS 二次输出
          </CardTitle>
          <CardDescription>
            将筛选后的文章重新生成公开 RSS 2.0 订阅链接（包含最新 50 篇，自动排除已隐藏文章）
          </CardDescription>
        </div>
        <Button size="sm" className="rounded-md shrink-0" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          新建输出
        </Button>
      </CardHeader>
      <CardContent>
        {shareFeeds.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center space-y-2">
            <p className="text-sm font-medium">还没有创建 RSS 输出源</p>
            <p className="text-xs text-muted-foreground">
              你可以按标签、文件夹、加星状态或内容类型组合出专属 RSS
              链接，分享给朋友或接入其他自动化工具。
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {shareFeeds.map((item) => {
              const filterTags = buildFilterTags(item.filter, feedNames, folderNames, tagNames);
              return (
                <li key={item.id} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <div className="flex flex-wrap gap-1">
                        {filterTags.map((label) => (
                          <Badge key={label} variant="secondary">
                            {label}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRotate(item)}
                        disabled={rotateMutation.isPending}
                        aria-label={`重置链接 ${item.name}`}
                        title="重置公开链接"
                      >
                        <RefreshCw className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(item)}
                        disabled={deleteMutation.isPending}
                        aria-label={`删除输出 ${item.name}`}
                        title="删除"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 min-w-0 truncate rounded-md border border-border bg-muted/50 px-2.5 py-1.5 font-mono text-xs">
                      {item.url}
                    </code>
                    <CopyButton value={item.url} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="!max-w-none rounded-lg w-[min(520px,94vw)] max-h-[85dvh] overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle>新建 RSS 输出源</DialogTitle>
          </DialogHeader>
          {createOpen && (
            <CreateShareFeedForm
              subs={subs}
              folders={folders}
              tags={tags}
              onClose={() => setCreateOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
