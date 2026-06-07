"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Rss,
  Star,
  Home,
  CircleDot,
  Plus,
  Trash2,
  LogOut,
  Settings,
  Pencil,
  Link,
  MoreHorizontal,
  Sun,
  Moon,
  ChevronRight,
  FolderOpen,
  Compass,
  X,
  AlertTriangle,
  CheckCheck,
  RefreshCw,
  Sparkles,
  Tag,
  Clock,
  Search,
} from "lucide-react";
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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { signOut } from "@/lib/auth/client";
import { toast } from "sonner";
import { cn, proxyImg } from "@/lib/utils";
import { AiSearchDialog } from "@/components/ai-search-dialog";

interface Subscription {
  id: string;
  feedId: string;
  title: string | null;
  feedTitle: string | null;
  url: string;
  iconUrl: string | null;
  folderId: string | null;
  unreadCount?: number;
  lastFetchError?: string | null;
  errorCode?: string | null;
  consecutiveFailures?: number | null;
  lastFetchedAt?: string | Date | null;
}

interface Folder {
  id: string;
  name: string;
  position?: number | null;
}

interface AppSidebarProps {
  subscriptions: Subscription[];
  folders: Folder[];
}

const smartViews = [
  { key: "all", label: "Home", icon: Home },
  { key: "unread", label: "Unread", icon: CircleDot },
  { key: "starred", label: "Starred", icon: Star },
] as const;

const navLinks = [
  { href: "/reader?search=", label: "Search", icon: Search },
  { href: "/reader/tags", label: "Tags", icon: Tag },
  { href: "/reader/history", label: "History", icon: Clock },
  { href: "/discover", label: "Discover", icon: Compass },
] as const;

export function AppSidebar({
  subscriptions: initialSubs,
  folders: initialFolders,
}: AppSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const activeFeedId = searchParams.get("feedId");
  const activeFolderId = searchParams.get("folderId");
  const activeView = searchParams.get("view") ?? "all";
  const { theme, setTheme } = useTheme();

  const [subs, setSubs] = useState(initialSubs);

  useSSE((event) => {
    if (event.type === "feed.deleted") {
      setSubs((prev) => prev.filter((s) => s.id !== event.subscriptionId));
    }
    if (event.type === "feed.error") {
      setSubs((prev) =>
        prev.map((s) =>
          s.feedId === event.feedId
            ? { ...s, lastFetchError: event.message }
            : s,
        ),
      );
    }
  });

  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  // Sync unread counts when articles are marked read from the reader
  useEffect(() => {
    function onDelta(e: Event) {
      const { feedId, delta } = (e as CustomEvent<{ feedId: string; delta: number }>).detail;
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
        e as CustomEvent<{ feedId?: string; folderId?: string }>
      ).detail;
      setSubs((prev) =>
        prev.map((s) => {
          if (targetFeedId && s.feedId !== targetFeedId) return s;
          if (targetFolderId && s.folderId !== targetFolderId) return s;
          return { ...s, unreadCount: 0 };
        }),
      );
    }
    window.addEventListener("feedwise:unread-delta", onDelta);
    window.addEventListener("feedwise:mark-all-read", onMarkAll);
    return () => {
      window.removeEventListener("feedwise:unread-delta", onDelta);
      window.removeEventListener("feedwise:mark-all-read", onMarkAll);
    };
  }, []);

  // Add feed state
  const [addOpen, setAddOpen] = useState(false);
  const [feedUrl, setFeedUrl] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  // Rename state
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Subscription | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);

  // Edit URL state
  const [editUrlOpen, setEditUrlOpen] = useState(false);
  const [editUrlTarget, setEditUrlTarget] = useState<Subscription | null>(null);
  const [editUrlValue, setEditUrlValue] = useState("");
  const [editUrlSaving, setEditUrlSaving] = useState(false);
  const [editUrlError, setEditUrlError] = useState("");

  // AI search
  const [aiSearchOpen, setAiSearchOpen] = useState(false);

  // Folders (rename / delete / create) state
  const [foldersState, setFoldersState] = useState<Folder[]>(initialFolders);
  const [folderRenameOpen, setFolderRenameOpen] = useState(false);
  const [folderRenameTarget, setFolderRenameTarget] = useState<Folder | null>(null);
  const [folderRenameName, setFolderRenameName] = useState("");
  const [folderRenameSaving, setFolderRenameSaving] = useState(false);
  const [folderRenameError, setFolderRenameError] = useState("");
  const [folderCreateOpen, setFolderCreateOpen] = useState(false);
  const [folderCreateName, setFolderCreateName] = useState("");
  const [folderCreateSaving, setFolderCreateSaving] = useState(false);
  const [folderCreateError, setFolderCreateError] = useState("");

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
    router.replace(`/reader?${p.toString()}`);
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

  async function handleAddFeed(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    setAdding(true);
    try {
      const urls = feedUrl
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      if (urls.length === 0) return;

      const res = await fetch("/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(urls.length === 1 ? { url: urls[0] } : { urls }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const failed = data.data?.failed ?? 0;
      if (failed > 0) {
        const failedLines = (data.data?.results ?? [])
          .filter((r: { error?: string }) => r.error)
          .map((r: { url: string; error?: string }) => `${r.url} — ${r.error ?? "Failed"}`)
          .join("\n");
        setAddError(`${failed} feed(s) failed:\n${failedLines}`);
      }

      setFeedUrl("");
      if (failed === 0) setAddOpen(false);
      const subsRes = await fetch("/api/feeds");
      const subsData = await subsRes.json();
      if (subsData.success) setSubs(subsData.data);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add feed");
    } finally {
      setAdding(false);
    }
  }

  function openRename(sub: Subscription) {
    setRenameTarget(sub);
    setRenameName(sub.title ?? sub.feedTitle ?? "");
    setRenameOpen(true);
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!renameTarget) return;
    setRenaming(true);
    try {
      const res = await fetch(`/api/feeds/${renameTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customTitle: renameName.trim() || null }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setSubs((prev) =>
        prev.map((s) =>
          s.id === renameTarget.id ? { ...s, title: renameName.trim() || null } : s,
        ),
      );
      setRenameOpen(false);
    } finally {
      setRenaming(false);
    }
  }

  function openEditUrl(sub: Subscription) {
    setEditUrlTarget(sub);
    setEditUrlValue(sub.url);
    setEditUrlError("");
    setEditUrlOpen(true);
  }

  async function handleEditUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!editUrlTarget) return;
    setEditUrlSaving(true);
    setEditUrlError("");
    try {
      const res = await fetch(`/api/feeds/${editUrlTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedUrl: editUrlValue.trim() }),
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) throw new Error(data.error ?? "Failed to update URL");
      setSubs((prev) =>
        prev.map((s) => (s.id === editUrlTarget.id ? { ...s, url: editUrlValue.trim() } : s)),
      );
      setEditUrlOpen(false);
    } catch (err) {
      setEditUrlError(err instanceof Error ? err.message : "Failed to update URL");
    } finally {
      setEditUrlSaving(false);
    }
  }

  async function handleMarkFeedAllRead(sub: Subscription) {
    await fetch(`/api/articles/mark-all-read?feedId=${sub.feedId}`, { method: "POST" });
    setSubs((prev) => prev.map((s) => (s.id === sub.id ? { ...s, unreadCount: 0 } : s)));
    toast.success("Marked all as read");
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

  function openFolderRename(folder: Folder) {
    setFolderRenameTarget(folder);
    setFolderRenameName(folder.name);
    setFolderRenameError("");
    setFolderRenameOpen(true);
  }

  async function handleFolderRename(e: React.FormEvent) {
    e.preventDefault();
    if (!folderRenameTarget) return;
    const name = folderRenameName.trim();
    if (!name) {
      setFolderRenameError("Name is required");
      return;
    }
    setFolderRenameSaving(true);
    setFolderRenameError("");
    try {
      const res = await fetch(`/api/folders/${folderRenameTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) throw new Error(data.error ?? "Failed to rename");
      setFoldersState((prev) =>
        prev.map((f) => (f.id === folderRenameTarget.id ? { ...f, name } : f)),
      );
      setFolderRenameOpen(false);
    } catch (err) {
      setFolderRenameError(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      setFolderRenameSaving(false);
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

  async function handleFolderCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = folderCreateName.trim();
    if (!name) {
      setFolderCreateError("Name is required");
      return;
    }
    setFolderCreateSaving(true);
    setFolderCreateError("");
    try {
      const res = await fetch(`/api/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as {
        success: boolean;
        error?: string;
        data?: { id: string; name: string; position?: number | null };
      };
      if (!data.success || !data.data) throw new Error(data.error ?? "Failed to create");
      setFoldersState((prev) => [...prev, { id: data.data!.id, name: data.data!.name }]);
      setFolderCreateName("");
      setFolderCreateOpen(false);
    } catch (err) {
      setFolderCreateError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setFolderCreateSaving(false);
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
    await fetch(`/api/feeds/${sub.id}`, { method: "DELETE" });
    setSubs((prev) => prev.filter((s) => s.id !== sub.id));
    if (activeFeedId === sub.feedId) {
      navigate({ feedId: null, view: "all" });
    }
  }

  function FeedIcon({ url, name }: { url: string | null; name: string }) {
    if (url) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={proxyImg(url)}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-4 rounded-sm shrink-0"
        />
      );
    }
    const letter = (name || "?")[0].toUpperCase();
    return (
      <span className="size-4 rounded-sm bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0">
        {letter}
      </span>
    );
  }

  function renderFeedItem(sub: Subscription) {
    const name = sub.title ?? sub.feedTitle ?? sub.url;
    return (
      <SidebarMenuItem key={sub.id}>
        <SidebarMenuButton
          isActive={activeFeedId === sub.feedId}
          onClick={() => navigate({ feedId: sub.feedId, folderId: null, tag: null, view: "all" })}
          className="group rounded-md h-8 transition-all duration-150"
        >
          <FeedIcon url={sub.iconUrl} name={name} />
          <span className="truncate flex-1 text-sm">{name}</span>
          {sub.lastFetchError && (
            <span
              title={
                (sub.consecutiveFailures ?? 0) > 1
                  ? `${sub.lastFetchError} (${sub.consecutiveFailures} failures in a row)`
                  : sub.lastFetchError
              }
              className="shrink-0 inline-flex items-center gap-0.5"
            >
              <AlertTriangle className="size-3 text-destructive/70" />
              {(sub.consecutiveFailures ?? 0) >= 3 && (
                <span className="text-[9px] tabular-nums text-destructive/70 font-medium">
                  {sub.consecutiveFailures}
                </span>
              )}
            </span>
          )}
          {sub.unreadCount != null && sub.unreadCount > 0 && (
            <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              {sub.unreadCount}
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<span />}
              nativeButton={false}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded-md hover:bg-accent/80 transition-opacity cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-md">
              {(sub.unreadCount ?? 0) > 0 && (
                <>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMarkFeedAllRead(sub);
                    }}
                  >
                    <CheckCheck className="size-4" />
                    Mark all read
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleRefresh(sub);
                }}
              >
                <RefreshCw className="size-4" />
                {sub.lastFetchError ? "Retry now" : "Refresh now"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  openRename(sub);
                }}
              >
                <Pencil className="size-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  openEditUrl(sub);
                }}
              >
                <Link className="size-4" />
                Edit URL
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderOpen className="size-4" />
                  Move to folder
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveFeedToFolder(sub, null);
                    }}
                  >
                    No folder
                  </DropdownMenuItem>
                  {foldersState.length > 0 && <DropdownMenuSeparator />}
                  {foldersState.map((f) => (
                    <DropdownMenuItem
                      key={f.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveFeedToFolder(sub, f.id);
                      }}
                      disabled={sub.folderId === f.id}
                    >
                      {f.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(sub);
                }}
              >
                <Trash2 className="size-4" />
                Unsubscribe
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  function SortableFolderGroup({
    folder,
    folderSubs,
  }: {
    folder: Folder;
    folderSubs: Subscription[];
  }) {
    const sortable = useSortable({ id: folder.id });
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;
    const style: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    const isCollapsed = collapsedFolders.has(folder.id);
    const unread = folderUnreadCount(folder.id);
    const isActiveFolder = activeFolderId === folder.id;

    return (
      <div ref={setNodeRef} style={style} {...attributes}>
        <SidebarGroup>
          <SidebarGroupLabel
            className={cn(
              "group/folder flex items-center justify-between pr-1 text-xs uppercase tracking-wider text-muted-foreground/70",
              isActiveFolder && "text-foreground",
            )}
          >
            <button
              type="button"
              {...listeners}
              onClick={() => toggleFolder(folder.id)}
              className="flex items-center gap-1 flex-1 min-w-0 cursor-grab active:cursor-grabbing select-none"
              title="Click to toggle, drag to reorder"
            >
              <ChevronRight
                className={cn(
                  "size-3 shrink-0 transition-transform duration-150",
                  !isCollapsed && "rotate-90",
                )}
              />
              <span className="truncate">{folder.name}</span>
            </button>
            <div className="flex items-center gap-1 shrink-0">
              {unread > 0 && (
                <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  {unread}
                </span>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<span />}
                  nativeButton={false}
                  className="opacity-0 group-hover/folder:opacity-100 size-5 inline-flex items-center justify-center rounded-md hover:bg-accent transition-opacity cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-md">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate({ folderId: folder.id, feedId: null, tag: null, view: "all" });
                    }}
                  >
                    <FolderOpen className="size-4" />
                    View all in folder
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      openFolderRename(folder);
                    }}
                  >
                    <Pencil className="size-4" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFolderDelete(folder);
                    }}
                  >
                    <Trash2 className="size-4" />
                    Delete folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </SidebarGroupLabel>
          {!isCollapsed && (
            <SidebarGroupContent>
              <SidebarMenu>
                {folderSubs.length > 0 ? (
                  folderSubs.map(renderFeedItem)
                ) : (
                  <li className="px-2 py-1 text-[11px] text-muted-foreground/60 italic">
                    Empty — drag a feed in or use Move to folder.
                  </li>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          )}
        </SidebarGroup>
      </div>
    );
  }

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
            title="Ask AI"
            className="size-6 inline-flex items-center justify-center rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-primary"
          >
            <Sparkles className="size-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<span />}
              nativeButton={false}
              className="size-6 inline-flex items-center justify-center rounded-md hover:bg-accent transition-colors cursor-pointer"
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
                  setFolderCreateError("");
                  setFolderCreateOpen(true);
                }}
              >
                <FolderOpen className="size-4" />
                New folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {/* Smart views */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {smartViews.map(({ key, label, icon: Icon }) => (
                <SidebarMenuItem key={key}>
                  <SidebarMenuButton
                    isActive={
                      activeView === key &&
                      !activeFeedId &&
                      !activeFolderId &&
                      !searchParams.has("search") &&
                      pathname === "/reader"
                    }
                    onClick={() => {
                      router.replace(`/reader?view=${key}`);
                    }}
                    className="rounded-md h-9 transition-all duration-150"
                  >
                    <Icon
                      className={cn(
                        "size-4",
                        key === "starred" && activeView === key && "text-yellow-500",
                      )}
                    />
                    <span className="flex-1">{label}</span>
                    {key === "unread" && totalUnread > 0 && (
                      <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                        {totalUnread}
                      </span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {navLinks.map(({ href, label, icon: Icon }) => {
                // Search lives at /reader?search=… so pathname alone can't tell
                // it apart from Home — check the query string too.
                const isSearchLink = href.startsWith("/reader?search");
                const isActive = isSearchLink
                  ? pathname === "/reader" && searchParams.has("search")
                  : pathname === href;
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => {
                        // Same-URL clicks don't navigate; for Search, refocus
                        // the page's input so the click still feels responsive.
                        if (isSearchLink && isActive) {
                          window.dispatchEvent(new CustomEvent("feedwise:focus-search"));
                        } else {
                          router.push(href);
                        }
                      }}
                      className="rounded-md h-9 transition-all duration-150"
                    >
                      <Icon className="size-4" />
                      <span className="flex-1">{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

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
              <SortableFolderGroup key={folder.id} folder={folder} folderSubs={folderSubs} />
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
                className="size-5 inline-flex items-center justify-center rounded-md hover:bg-accent transition-colors"
              >
                <Plus className="size-3" />
              </button>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{uncategorized.map(renderFeedItem)}</SidebarMenu>
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
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <Sun className="size-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute size-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-md"
            onClick={() => {
              const p = new URLSearchParams(searchParams.toString());
              p.set("settings", "appearance");
              router.replace(`${pathname}?${p.toString()}`);
            }}
            title="Settings"
          >
            <Settings className="size-4" />
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-md text-muted-foreground"
            onClick={() => signOut().then(() => router.push("/login"))}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </SidebarFooter>

      {/* Add Feed dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="rounded-lg">
          <DialogHeader>
            <DialogTitle>Add Feed</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddFeed} className="space-y-3 pt-2">
            <Textarea
              placeholder={"https://example.com/feed.xml\nhttps://another.com/rss\n..."}
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              rows={4}
              autoFocus
              className="rounded-md resize-none text-sm"
            />
            <p className="text-xs text-muted-foreground">One URL per line for batch add</p>
            {addError && <p className="text-destructive text-sm whitespace-pre-line">{addError}</p>}
            <Button
              type="submit"
              className="w-full rounded-md"
              disabled={adding || feedUrl.trim().length === 0}
            >
              {adding ? "Adding…" : "Subscribe"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="rounded-lg">
          <DialogHeader>
            <DialogTitle>Rename Feed</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRename} className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="rename-input">Custom name</Label>
              <Input
                id="rename-input"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                placeholder={renameTarget?.feedTitle ?? "Feed name"}
                autoFocus
                className="rounded-md"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={renaming} className="flex-1 rounded-md">
                {renaming ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-md"
                onClick={() => setRenameOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* AI search dialog */}
      <AiSearchDialog open={aiSearchOpen} onOpenChange={setAiSearchOpen} />

      {/* Folder create dialog */}
      <Dialog open={folderCreateOpen} onOpenChange={setFolderCreateOpen}>
        <DialogContent className="rounded-lg">
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleFolderCreate} className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="folder-create-input">Name</Label>
              <Input
                id="folder-create-input"
                value={folderCreateName}
                onChange={(e) => setFolderCreateName(e.target.value)}
                placeholder="e.g. Tech, News, Friends"
                autoFocus
                className="rounded-md"
              />
            </div>
            {folderCreateError && <p className="text-destructive text-sm">{folderCreateError}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={folderCreateSaving} className="flex-1 rounded-md">
                {folderCreateSaving ? "Creating…" : "Create"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-md"
                onClick={() => setFolderCreateOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Folder rename dialog */}
      <Dialog open={folderRenameOpen} onOpenChange={setFolderRenameOpen}>
        <DialogContent className="rounded-lg">
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleFolderRename} className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="folder-rename-input">Name</Label>
              <Input
                id="folder-rename-input"
                value={folderRenameName}
                onChange={(e) => setFolderRenameName(e.target.value)}
                autoFocus
                className="rounded-md"
              />
            </div>
            {folderRenameError && <p className="text-destructive text-sm">{folderRenameError}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={folderRenameSaving} className="flex-1 rounded-md">
                {folderRenameSaving ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-md"
                onClick={() => setFolderRenameOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit URL dialog */}
      <Dialog open={editUrlOpen} onOpenChange={setEditUrlOpen}>
        <DialogContent className="rounded-lg">
          <DialogHeader>
            <DialogTitle>Edit Feed URL</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditUrl} className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-url-input">Feed URL</Label>
              <Input
                id="edit-url-input"
                value={editUrlValue}
                onChange={(e) => setEditUrlValue(e.target.value)}
                placeholder="https://example.com/feed.xml"
                type="url"
                required
                autoFocus
                className="rounded-md"
              />
            </div>
            {editUrlError && <p className="text-destructive text-sm">{editUrlError}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={editUrlSaving} className="flex-1 rounded-md">
                {editUrlSaving ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-md"
                onClick={() => setEditUrlOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}
