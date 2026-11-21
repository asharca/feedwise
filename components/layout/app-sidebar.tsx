"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Sidebar, SidebarContent, useSidebar } from "@/components/ui/sidebar";
import { AiSearchDialog } from "@/components/ai-search-dialog";
import { AddFeedDialog } from "./sidebar/add-feed-dialog";
import { FeedSettingsDialog } from "./sidebar/feed-settings-dialog";
import { CreateFolderDialog, RenameFolderDialog } from "./sidebar/folder-dialogs";
import { SidebarFeedsSection } from "./sidebar/sidebar-feeds-section";
import { SidebarFooterSection } from "./sidebar/sidebar-footer";
import { SidebarHeaderSection } from "./sidebar/sidebar-header";
import { SidebarNav } from "./sidebar/sidebar-nav";
import { useSidebarData } from "./sidebar/use-sidebar-data";
import type { FeedItemActions } from "./sidebar/feed-item";
import type { Folder, Subscription } from "./sidebar/types";

interface AppSidebarProps {
  subscriptions: Subscription[];
  folders: Folder[];
}

const SCROLL_KEY = "feedwise-sidebar-scroll";

export function AppSidebar({
  subscriptions: initialSubs,
  folders: initialFolders,
}: AppSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  const activeFeedId = searchParams.get("feedId");
  const activeFolderId = searchParams.get("folderId");

  // Persist sidebar scroll position across navigations (URL changes cause re-renders
  // that can reset the scroll container back to top).
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const saved = Number(sessionStorage.getItem(SCROLL_KEY) ?? "0");
    if (saved > 0) el.scrollTop = saved;
  }, [pathname, searchParams]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const save = () => sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop));
    el.addEventListener("scroll", save, { passive: true });
    return () => el.removeEventListener("scroll", save);
  }, []);

  const {
    subs,
    folders,
    folderGroups,
    uncategorized,
    totalUnread,
    markFeedAllRead,
    refreshFeed,
    moveFeedToFolder,
    deleteFeed,
    reorderFolders,
    deleteFolder,
  } = useSidebarData(initialSubs, initialFolders);

  // Dialog open/target state
  const [aiSearchOpen, setAiSearchOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [settingsTargetId, setSettingsTargetId] = useState<string | null>(null);
  const [folderCreateOpen, setFolderCreateOpen] = useState(false);
  const [folderRenameTargetId, setFolderRenameTargetId] = useState<string | null>(null);

  const settingsTarget = settingsTargetId
    ? (subs.find((s) => s.id === settingsTargetId) ?? null)
    : null;
  const folderRenameTarget = folderRenameTargetId
    ? (folders.find((f) => f.id === folderRenameTargetId) ?? null)
    : null;

  function navigate(params: Record<string, string | null>) {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("articleId");
    p.delete("search");
    for (const [k, v] of Object.entries(params)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    setOpenMobile(false);
    router.replace(`/reader?${p.toString()}`);
  }

  function handleDeleteFeed(sub: Subscription) {
    const label = sub.title || sub.feedTitle || sub.url;
    if (!window.confirm(`确定取消订阅「${label}」吗？`)) return;
    deleteFeed.mutate(sub, {
      onSuccess: () => {
        if (activeFeedId === sub.feedId) {
          navigate({ feedId: null, view: "all" });
        }
      },
    });
  }

  function handleDeleteFolder(folder: Folder) {
    if (!window.confirm(`确定删除文件夹「${folder.name}」吗？其中的订阅将变为未分类。`)) return;
    deleteFolder.mutate(folder, {
      onSuccess: () => {
        if (activeFolderId === folder.id) {
          navigate({ folderId: null, view: "all" });
        }
      },
    });
  }

  const feedActions: FeedItemActions = {
    onNavigate: (sub) => navigate({ feedId: sub.feedId, folderId: null, tag: null, view: "all" }),
    onMarkAllRead: (sub) => markFeedAllRead.mutate(sub),
    onRefresh: (sub) => refreshFeed.mutate(sub),
    onOpenSettings: (sub) => setSettingsTargetId(sub.id),
    onMoveToFolder: (sub, folderId) => moveFeedToFolder.mutate({ sub, folderId }),
    onDelete: handleDeleteFeed,
  };

  return (
    <Sidebar className="border-r-0">
      <SidebarHeaderSection
        onOpenAiSearch={() => setAiSearchOpen(true)}
        onOpenAddFeed={() => setAddOpen(true)}
        onOpenCreateFolder={() => setFolderCreateOpen(true)}
      />

      <SidebarContent ref={scrollRef} className="scrollbar-thin">
        <SidebarNav totalUnread={totalUnread} />
        <SidebarFeedsSection
          folders={folders}
          folderGroups={folderGroups}
          uncategorized={uncategorized}
          activeFeedId={activeFeedId}
          activeFolderId={activeFolderId}
          onReorderFolders={(next) => reorderFolders.mutate(next)}
          onViewFolder={(f) => navigate({ folderId: f.id, feedId: null, tag: null, view: "all" })}
          onRenameFolder={(f) => setFolderRenameTargetId(f.id)}
          onDeleteFolder={handleDeleteFolder}
          onOpenAddFeed={() => setAddOpen(true)}
          feedActions={feedActions}
        />
      </SidebarContent>

      <SidebarFooterSection />

      <AiSearchDialog open={aiSearchOpen} onOpenChange={setAiSearchOpen} />
      <AddFeedDialog open={addOpen} onOpenChange={setAddOpen} />
      <FeedSettingsDialog
        open={settingsTarget !== null}
        target={settingsTarget}
        folders={folders}
        onOpenChange={(open) => {
          if (!open) setSettingsTargetId(null);
        }}
      />
      <CreateFolderDialog open={folderCreateOpen} onOpenChange={setFolderCreateOpen} />
      <RenameFolderDialog
        open={folderRenameTarget !== null}
        target={folderRenameTarget}
        onOpenChange={(open) => {
          if (!open) setFolderRenameTargetId(null);
        }}
      />
    </Sidebar>
  );
}
