"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Rss, Plus, LogOut, Settings, Sun, Moon, X, FolderOpen, Sparkles } from "lucide-react";
import { useTheme } from "next-themes";
import { useSSE } from "@/lib/hooks/use-sse";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/client";
import { cn } from "@/lib/utils";
import {
  UNREAD_DELTA_EVENT,
  MARK_ALL_READ_EVENT,
  SUBSCRIPTIONS_CHANGED_EVENT,
  type UnreadDeltaDetail,
  type MarkAllReadDetail,
} from "@/lib/reader/events";
import { toast } from "sonner";
import { AiSearchDialog } from "@/components/ai-search-dialog";
import { AddFeedDialog } from "./sidebar/add-feed-dialog";
import { RenameFeedDialog } from "./sidebar/rename-feed-dialog";
import { EditFeedUrlDialog } from "./sidebar/edit-feed-url-dialog";
import { CreateFolderDialog, RenameFolderDialog } from "./sidebar/folder-dialogs";
import { FeedItem } from "./sidebar/feed-item";
import type { FeedItemActions } from "./sidebar/feed-item";
import { SortableFolderGroup } from "./sidebar/folder-group";
import { SidebarNav } from "./sidebar/sidebar-nav";
import type { Subscription, Folder } from "./sidebar/types";

interface AppSidebarProps {
  subscriptions: Subscription[];
  folders: Folder[];
}

export function AppSidebar({
  subscriptions: initialSubs,
  folders: initialFolders,
}: AppSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const activeFeedId = searchParams.get("feedId");
  const activeFolderId = searchParams.get("folderId");
  const { resolvedTheme, setTheme } = useTheme();
  const { setOpenMobile } = useSidebar();
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";

  // Persist sidebar scroll position across navigations (URL changes cause re-renders
  // that can reset the scroll container back to top).
  const scrollRef = useRef<HTMLDivElement>(null);
  const SCROLL_KEY = "feedwise-sidebar-scroll";

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

  const [subs, setSubs] = useState(initialSubs);

  useEffect(() => {
    setSubs(initialSubs);
  }, [initialSubs]);

  useEffect(() => {
    let controller: AbortController | null = null;

    async function refreshSubscriptions() {
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;

      try {
        const response = await fetch("/api/feeds", { signal: requestController.signal });
        if (!response.ok) throw new Error("Failed to refresh subscriptions");

        const data = (await response.json()) as {
          success: boolean;
          data?: Subscription[];
        };
        if (!data.success || !Array.isArray(data.data)) {
          throw new Error("Invalid subscriptions response");
        }

        setSubs(data.data);
      } catch {
        if (requestController.signal.aborted) return;
        router.refresh();
      }
    }

    function onSubscriptionsChanged() {
      void refreshSubscriptions();
    }

    window.addEventListener(SUBSCRIPTIONS_CHANGED_EVENT, onSubscriptionsChanged);
    return () => {
      controller?.abort();
      window.removeEventListener(SUBSCRIPTIONS_CHANGED_EVENT, onSubscriptionsChanged);
    };
  }, [router]);

  useSSE((event) => {
    if (event.type === "feed.deleted") {
      setSubs((prev) => prev.filter((s) => s.id !== event.subscriptionId));
    }
    if (event.type === "feed.error") {
      setSubs((prev) =>
        prev.map((s) => (s.feedId === event.feedId ? { ...s, lastFetchError: event.message } : s)),
      );
    }
  });

  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  // Sync unread counts when articles are marked read from the reader
  useEffect(() => {
    function onDelta(e: Event) {
      const { feedId, delta } = (e as CustomEvent<UnreadDeltaDetail>).detail;
      setSubs((prev) =>
        prev.map((s) =>
          s.feedId === feedId
            ? { ...s, unreadCount: Math.max(0, (s.unreadCount ?? 0) + delta) }
            : s,
        ),
      );
    }
    function onMarkAll(e: Event) {
      const { feedId: targetFeedId, folderId: targetFolderId } = (
        e as CustomEvent<MarkAllReadDetail>
      ).detail;
      setSubs((prev) =>
        prev.map((s) => {
          if (targetFeedId && s.feedId !== targetFeedId) return s;
          if (targetFolderId && s.folderId !== targetFolderId) return s;
          return { ...s, unreadCount: 0 };
        }),
      );
    }
    window.addEventListener(UNREAD_DELTA_EVENT, onDelta);
    window.addEventListener(MARK_ALL_READ_EVENT, onMarkAll);
    return () => {
      window.removeEventListener(UNREAD_DELTA_EVENT, onDelta);
      window.removeEventListener(MARK_ALL_READ_EVENT, onMarkAll);
    };
  }, []);

  // Dialog open/target state
  const [addOpen, setAddOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Subscription | null>(null);
  const [editUrlOpen, setEditUrlOpen] = useState(false);
  const [editUrlTarget, setEditUrlTarget] = useState<Subscription | null>(null);
  const [aiSearchOpen, setAiSearchOpen] = useState(false);
  const [foldersState, setFoldersState] = useState<Folder[]>(initialFolders);
  const [folderRenameOpen, setFolderRenameOpen] = useState(false);
  const [folderRenameTarget, setFolderRenameTarget] = useState<Folder | null>(null);
  const [folderCreateOpen, setFolderCreateOpen] = useState(false);

  const totalUnread = subs.reduce((sum, s) => sum + (s.unreadCount ?? 0), 0);

  // Group subs by folder
  const folderMap = new Map<string, { folder: Folder; subs: Subscription[] }>();
  const uncategorized: Subscription[] = [];

  for (const folder of foldersState) {
    folderMap.set(folder.id, { folder, subs: [] });
  }
  for (const sub of subs) {
    if (sub.folderId && folderMap.has(sub.folderId)) {
      folderMap.get(sub.folderId)!.subs.push(sub);
    } else {
      uncategorized.push(sub);
    }
  }

  function navigate(params: Record<string, string | null>) {
    const p = new URLSearchParams(searchParams.toString());
    // Changing the list scope from the sidebar always collapses whatever
    // article is open — staying on a now off-list article would be confusing.
    if (!("articleId" in params)) p.delete("articleId");
    for (const [k, v] of Object.entries(params)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    setOpenMobile(false);
    router.replace(`/reader?${p.toString()}`);
  }

  function handleSettingsClick() {
    setOpenMobile(false);

    // The dedicated settings route already renders SettingsContent. Do not
    // layer the query-driven settings dialog over the same page.
    if (pathname === "/settings") return;

    const p = new URLSearchParams(searchParams.toString());
    p.set("settings", "appearance");
    router.replace(`${pathname}?${p.toString()}`);
  }

  function toggleFolder(folderId: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  function folderUnreadCount(folderId: string): number {
    const group = folderMap.get(folderId);
    if (!group) return 0;
    return group.subs.reduce((sum, s) => sum + (s.unreadCount ?? 0), 0);
  }

  async function handleMarkFeedAllRead(sub: Subscription) {
    try {
      const response = await fetch(`/api/articles/mark-all-read?feedId=${sub.feedId}`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;
      if (!response.ok || !body?.success) {
        throw new Error(body?.error ?? "Failed to mark articles as read");
      }
      setSubs((prev) => prev.map((s) => (s.id === sub.id ? { ...s, unreadCount: 0 } : s)));
      toast.success("Marked all as read");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to mark articles as read");
    }
  }

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  async function handleFolderDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = foldersState.findIndex((f) => f.id === active.id);
    const newIndex = foldersState.findIndex((f) => f.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(foldersState, oldIndex, newIndex);
    setFoldersState(next);
    try {
      const res = await fetch("/api/folders/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderIds: next.map((f) => f.id) }),
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) throw new Error(data.error ?? "Failed to reorder");
    } catch (err) {
      // Roll back on failure
      setFoldersState(foldersState);
      toast.error(err instanceof Error ? err.message : "Failed to reorder folders");
    }
  }

  async function handleFolderDelete(folder: Folder) {
    const confirmed = window.confirm(
      `Delete folder "${folder.name}"? Feeds inside it will become uncategorised.`,
    );
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/folders/${folder.id}`, { method: "DELETE" });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) throw new Error(data.error ?? "Failed to delete");
      setFoldersState((prev) => prev.filter((f) => f.id !== folder.id));
      setSubs((prev) => prev.map((s) => (s.folderId === folder.id ? { ...s, folderId: null } : s)));
      if (activeFolderId === folder.id) {
        navigate({ folderId: null, view: "all" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  async function handleMoveFeedToFolder(sub: Subscription, folderId: string | null) {
    try {
      const res = await fetch(`/api/feeds/${sub.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) throw new Error(data.error ?? "Failed to move");
      setSubs((prev) => prev.map((s) => (s.id === sub.id ? { ...s, folderId } : s)));
      const dest = folderId ? foldersState.find((f) => f.id === folderId)?.name : "Uncategorised";
      toast.success(`Moved to ${dest ?? "folder"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to move");
    }
  }

  async function handleRefresh(sub: Subscription) {
    const label = sub.title ?? sub.feedTitle ?? sub.url;
    try {
      const res = await fetch(`/api/feeds/${sub.id}/refresh`, { method: "POST" });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) throw new Error(data.error ?? "Failed to refresh");
      toast.success(`Refreshing ${label}…`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to refresh");
    }
  }

  async function handleDelete(sub: Subscription) {
    const confirmed = window.confirm(
      `Unsubscribe from "${sub.title ?? sub.feedTitle ?? sub.url}"?`,
    );
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/feeds/${sub.id}`, { method: "DELETE" });
      const body = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;
      if (!response.ok || !body?.success) {
        throw new Error(body?.error ?? "Failed to unsubscribe");
      }
      setSubs((prev) => prev.filter((s) => s.id !== sub.id));
      if (activeFeedId === sub.feedId) {
        navigate({ feedId: null, view: "all" });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unsubscribe");
    }
  }

  const feedActions: FeedItemActions = {
    onNavigate: (sub) => navigate({ feedId: sub.feedId, folderId: null, tag: null, view: "all" }),
    onMarkAllRead: handleMarkFeedAllRead,
    onRefresh: handleRefresh,
    onRename: (sub) => {
      setRenameTarget(sub);
      setRenameOpen(true);
    },
    onEditUrl: (sub) => {
      setEditUrlTarget(sub);
      setEditUrlOpen(true);
    },
    onMoveToFolder: handleMoveFeedToFolder,
    onDelete: handleDelete,
  };

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader className="px-3 py-3">
        <div className="flex items-center gap-2 px-1">
          <div className="size-7 rounded-md bg-primary flex items-center justify-center shrink-0">
            <Rss className="size-3.5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-base tracking-tight flex-1">Feedwise</span>
          <button
            type="button"
            onClick={() => setAiSearchOpen(true)}
            aria-label="Ask AI"
            title="Ask AI"
            className="size-6 inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-primary outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <Sparkles className="size-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<button type="button" />}
              aria-label="Add feed or folder"
              title="Add feed or folder"
              className="size-6 inline-flex items-center justify-center rounded-md transition-colors hover:bg-accent outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <Plus className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-md">
              <DropdownMenuItem onClick={() => setAddOpen(true)}>
                <Rss className="size-4" />
                Add feed
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setFolderCreateOpen(true);
                }}
              >
                <FolderOpen className="size-4" />
                New folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-6 rounded-md md:hidden"
            onClick={() => setOpenMobile(false)}
            aria-label="Close sidebar"
            title="Close sidebar"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent ref={scrollRef} className="px-2">
        {/* Smart views + nav links */}
        <SidebarNav totalUnread={totalUnread} />

        {/* Categorized feeds (with drag-to-reorder) */}
        <DndContext
          sensors={dndSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleFolderDragEnd}
        >
          <SortableContext
            items={foldersState.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
          >
            {Array.from(folderMap.values()).map(({ folder, subs: folderSubs }) => (
              <SortableFolderGroup
                key={folder.id}
                folder={folder}
                folderSubs={folderSubs}
                folders={foldersState}
                unreadCount={folderUnreadCount(folder.id)}
                isCollapsed={collapsedFolders.has(folder.id)}
                isActiveFolder={activeFolderId === folder.id}
                activeFeedId={activeFeedId}
                onToggle={toggleFolder}
                onViewAll={(f) =>
                  navigate({ folderId: f.id, feedId: null, tag: null, view: "all" })
                }
                onRename={(f) => {
                  setFolderRenameTarget(f);
                  setFolderRenameOpen(true);
                }}
                onDelete={handleFolderDelete}
                feedActions={feedActions}
              />
            ))}
          </SortableContext>
        </DndContext>

        {/* Uncategorized feeds */}
        {uncategorized.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center justify-between pr-1 text-xs uppercase tracking-wider text-muted-foreground/70">
              Feeds
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                aria-label="Add feed"
                title="Add feed"
                className="size-5 inline-flex items-center justify-center rounded-md transition-colors hover:bg-accent outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <Plus className="size-3" />
              </button>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {uncategorized.map((sub) => (
                  <FeedItem
                    key={sub.id}
                    sub={sub}
                    folders={foldersState}
                    isActive={activeFeedId === sub.feedId}
                    actions={feedActions}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="px-2 pb-3 space-y-1">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-md"
            onClick={() => setTheme(nextTheme)}
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            <Sun className="size-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute size-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "size-8 rounded-md",
              pathname === "/settings" &&
                "bg-primary/10 text-foreground shadow-[inset_2px_0_0_var(--primary)]",
            )}
            onClick={handleSettingsClick}
            aria-label="Settings"
            aria-current={pathname === "/settings" ? "page" : undefined}
            title="Settings"
          >
            <Settings className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-md text-muted-foreground"
            onClick={() => signOut().then(() => router.push("/login"))}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </SidebarFooter>

      {/* AI search dialog */}
      <AiSearchDialog open={aiSearchOpen} onOpenChange={setAiSearchOpen} />

      {/* Feed dialogs */}
      <AddFeedDialog open={addOpen} onOpenChange={setAddOpen} onSubsRefreshed={setSubs} />
      <RenameFeedDialog
        open={renameOpen}
        target={renameTarget}
        onOpenChange={setRenameOpen}
        onRenamed={(id, title) =>
          setSubs((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)))
        }
      />
      <EditFeedUrlDialog
        open={editUrlOpen}
        target={editUrlTarget}
        onOpenChange={setEditUrlOpen}
        onSaved={(id, url) => setSubs((prev) => prev.map((s) => (s.id === id ? { ...s, url } : s)))}
      />

      {/* Folder dialogs */}
      <CreateFolderDialog
        open={folderCreateOpen}
        onOpenChange={setFolderCreateOpen}
        onCreated={(folder) => setFoldersState((prev) => [...prev, folder])}
      />
      <RenameFolderDialog
        open={folderRenameOpen}
        target={folderRenameTarget}
        onOpenChange={setFolderRenameOpen}
        onRenamed={(folderId, name) =>
          setFoldersState((prev) => prev.map((f) => (f.id === folderId ? { ...f, name } : f)))
        }
      />
    </Sidebar>
  );
}
