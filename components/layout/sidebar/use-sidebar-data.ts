"use client";

import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/query/api";
import { queryKeys } from "@/lib/query/keys";
import {
  MARK_ALL_READ_EVENT,
  SUBSCRIPTIONS_CHANGED_EVENT,
  UNREAD_DELTA_EVENT,
  type MarkAllReadDetail,
  type UnreadDeltaDetail,
} from "@/lib/reader/events";
import type { Folder, Subscription } from "./types";

export interface FolderGroupData {
  folder: Folder;
  subs: Subscription[];
  unreadCount: number;
}

export function groupSubscriptionsByFolder(
  subs: Subscription[],
  folders: Folder[],
): { folderGroups: FolderGroupData[]; uncategorized: Subscription[]; totalUnread: number } {
  const subsByFolder = new Map<string, Subscription[]>();
  for (const folder of folders) {
    subsByFolder.set(folder.id, []);
  }

  const uncategorized: Subscription[] = [];
  let totalUnread = 0;

  for (const sub of subs) {
    totalUnread += sub.unreadCount ?? 0;
    const bucket = sub.folderId ? subsByFolder.get(sub.folderId) : undefined;
    if (bucket) {
      bucket.push(sub);
    } else {
      uncategorized.push(sub);
    }
  }

  const folderGroups: FolderGroupData[] = folders.map((folder) => {
    const folderSubs = subsByFolder.get(folder.id) ?? [];
    const unreadCount = folderSubs.reduce((sum, s) => sum + (s.unreadCount ?? 0), 0);
    return { folder, subs: folderSubs, unreadCount };
  });

  return { folderGroups, uncategorized, totalUnread };
}

export function useSidebarData(initialSubs: Subscription[], initialFolders: Folder[]) {
  const queryClient = useQueryClient();

  const feedsQuery = useQuery({
    queryKey: queryKeys.feeds.list(),
    queryFn: ({ signal }) => apiFetch<Subscription[]>("/api/feeds", { signal }),
    initialData: initialSubs,
  });

  const foldersQuery = useQuery({
    queryKey: queryKeys.folders.all,
    queryFn: ({ signal }) => apiFetch<Folder[]>("/api/folders", { signal }),
    initialData: initialFolders,
  });

  const subs = feedsQuery.data ?? initialSubs;
  const folders = foldersQuery.data ?? initialFolders;

  // Keep TanStack Query cache synced with legacy window-level reader events.
  // SSE invalidation lives in <RealtimeBridge /> mounted in app/(reader)/layout.tsx.
  useEffect(() => {
    function onUnreadDelta(e: Event) {
      const { feedId, delta } = (e as CustomEvent<UnreadDeltaDetail>).detail;
      queryClient.setQueryData<Subscription[]>(queryKeys.feeds.list(), (prev) =>
        prev?.map((s) =>
          s.feedId === feedId
            ? { ...s, unreadCount: Math.max(0, (s.unreadCount ?? 0) + delta) }
            : s,
        ),
      );
    }

    function onMarkAllRead(e: Event) {
      const { feedId, folderId } = (e as CustomEvent<MarkAllReadDetail>).detail;
      queryClient.setQueryData<Subscription[]>(queryKeys.feeds.list(), (prev) =>
        prev?.map((s) => {
          if (feedId && s.feedId !== feedId) return s;
          if (folderId && s.folderId !== folderId) return s;
          return { ...s, unreadCount: 0 };
        }),
      );
    }

    function onSubscriptionsChanged() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
    }

    window.addEventListener(UNREAD_DELTA_EVENT, onUnreadDelta);
    window.addEventListener(MARK_ALL_READ_EVENT, onMarkAllRead);
    window.addEventListener(SUBSCRIPTIONS_CHANGED_EVENT, onSubscriptionsChanged);
    return () => {
      window.removeEventListener(UNREAD_DELTA_EVENT, onUnreadDelta);
      window.removeEventListener(MARK_ALL_READ_EVENT, onMarkAllRead);
      window.removeEventListener(SUBSCRIPTIONS_CHANGED_EVENT, onSubscriptionsChanged);
    };
  }, [queryClient]);

  const markFeedAllRead = useMutation({
    mutationFn: (sub: Subscription) =>
      apiFetch<unknown>(`/api/articles/mark-all-read?feedId=${encodeURIComponent(sub.feedId)}`, {
        method: "POST",
      }),
    onMutate: async (sub) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.feeds.list() });
      const previous = queryClient.getQueryData<Subscription[]>(queryKeys.feeds.list());
      queryClient.setQueryData<Subscription[]>(queryKeys.feeds.list(), (prev) =>
        prev?.map((s) => (s.id === sub.id ? { ...s, unreadCount: 0 } : s)),
      );
      return { previous };
    },
    onSuccess: () => {
      toast.success("已全部标为已读");
      void queryClient.invalidateQueries({ queryKey: queryKeys.articles.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
    onError: (err, _sub, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.feeds.list(), context.previous);
      }
      toast.error(err instanceof Error ? err.message : "标记已读失败");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all });
    },
  });

  const refreshFeed = useMutation({
    mutationFn: (sub: Subscription) =>
      apiFetch<unknown>(`/api/feeds/${sub.id}/refresh`, { method: "POST" }),
    onSuccess: (_data, sub) => {
      const label = sub.title || sub.feedTitle || sub.url;
      toast.success(`正在刷新 ${label}…`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "刷新失败");
    },
  });

  const moveFeedToFolder = useMutation({
    mutationFn: ({ sub, folderId }: { sub: Subscription; folderId: string | null }) =>
      apiFetch<unknown>(`/api/feeds/${sub.id}`, {
        method: "PATCH",
        json: { folderId },
      }),
    onMutate: async ({ sub, folderId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.feeds.list() });
      const previous = queryClient.getQueryData<Subscription[]>(queryKeys.feeds.list());
      queryClient.setQueryData<Subscription[]>(queryKeys.feeds.list(), (prev) =>
        prev?.map((s) => (s.id === sub.id ? { ...s, folderId } : s)),
      );
      return { previous };
    },
    onSuccess: (_data, { folderId }) => {
      const dest = folderId ? folders.find((f) => f.id === folderId)?.name : "未分类";
      toast.success(`已移动到 ${dest ?? "文件夹"}`);
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.feeds.list(), context.previous);
      }
      toast.error(err instanceof Error ? err.message : "移动订阅失败");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all });
    },
  });

  const deleteFeed = useMutation({
    mutationFn: (sub: Subscription) =>
      apiFetch<unknown>(`/api/feeds/${sub.id}`, { method: "DELETE" }),
    onMutate: async (sub) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.feeds.list() });
      const previous = queryClient.getQueryData<Subscription[]>(queryKeys.feeds.list());
      queryClient.setQueryData<Subscription[]>(queryKeys.feeds.list(), (prev) =>
        prev?.filter((s) => s.id !== sub.id),
      );
      return { previous };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.articles.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
    onError: (err, _sub, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.feeds.list(), context.previous);
      }
      toast.error(err instanceof Error ? err.message : "取消订阅失败");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all });
    },
  });

  const reorderFolders = useMutation({
    mutationFn: (nextFolders: Folder[]) =>
      apiFetch<unknown>("/api/folders/reorder", {
        method: "PATCH",
        json: { folderIds: nextFolders.map((f) => f.id) },
      }),
    onMutate: async (nextFolders) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.folders.all });
      const previous = queryClient.getQueryData<Folder[]>(queryKeys.folders.all);
      queryClient.setQueryData<Folder[]>(queryKeys.folders.all, nextFolders);
      return { previous };
    },
    onError: (err, _next, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.folders.all, context.previous);
      }
      toast.error(err instanceof Error ? err.message : "文件夹排序失败");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
    },
  });

  const deleteFolder = useMutation({
    mutationFn: (folder: Folder) =>
      apiFetch<unknown>(`/api/folders/${folder.id}`, { method: "DELETE" }),
    onMutate: async (folder) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.folders.all });
      await queryClient.cancelQueries({ queryKey: queryKeys.feeds.list() });
      const previousFolders = queryClient.getQueryData<Folder[]>(queryKeys.folders.all);
      const previousSubs = queryClient.getQueryData<Subscription[]>(queryKeys.feeds.list());
      queryClient.setQueryData<Folder[]>(queryKeys.folders.all, (prev) =>
        prev?.filter((f) => f.id !== folder.id),
      );
      queryClient.setQueryData<Subscription[]>(queryKeys.feeds.list(), (prev) =>
        prev?.map((s) => (s.folderId === folder.id ? { ...s, folderId: null } : s)),
      );
      return { previousFolders, previousSubs };
    },
    onError: (err, _folder, context) => {
      if (context?.previousFolders) {
        queryClient.setQueryData(queryKeys.folders.all, context.previousFolders);
      }
      if (context?.previousSubs) {
        queryClient.setQueryData(queryKeys.feeds.list(), context.previousSubs);
      }
      toast.error(err instanceof Error ? err.message : "删除文件夹失败");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all });
    },
  });

  const grouped = useMemo(() => groupSubscriptionsByFolder(subs, folders), [subs, folders]);

  return {
    subs,
    folders,
    ...grouped,
    markFeedAllRead,
    refreshFeed,
    moveFeedToFolder,
    deleteFeed,
    reorderFolders,
    deleteFolder,
  };
}
