"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Rss,
  Star,
  Inbox,
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
} from "lucide-react";
import { useTheme } from "next-themes";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { signOut } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

interface Subscription {
  id: string;
  feedId: string;
  title: string | null;
  feedTitle: string | null;
  url: string;
  iconUrl: string | null;
  unreadCount?: number;
}

interface AppSidebarProps {
  subscriptions: Subscription[];
}

const smartViews = [
  { key: "all", label: "All Articles", icon: Inbox },
  { key: "unread", label: "Unread", icon: CircleDot },
  { key: "starred", label: "Starred", icon: Star },
] as const;

export function AppSidebar({ subscriptions: initialSubs }: AppSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeFeedId = searchParams.get("feedId");
  const activeView = searchParams.get("view") ?? "all";
  const { theme, setTheme } = useTheme();

  const [subs, setSubs] = useState(initialSubs);

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

  function navigate(params: Record<string, string | null>) {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    router.replace(`/reader?${p.toString()}`);
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
        const failedUrls = (data.data?.results ?? [])
          .filter((r: { error?: string }) => r.error)
          .map((r: { url: string }) => r.url)
          .join("\n");
        setAddError(`${failed} feed(s) failed:\n${failedUrls}`);
      }

      setFeedUrl("");
      if (failed === 0) setAddOpen(false);
      // Refresh sidebar feed list from server
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
          s.id === renameTarget.id
            ? { ...s, title: renameName.trim() || null }
            : s
        )
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
      const data = await res.json() as { success: boolean; error?: string };
      if (!data.success) throw new Error(data.error ?? "Failed to update URL");
      setSubs((prev) =>
        prev.map((s) =>
          s.id === editUrlTarget.id ? { ...s, url: editUrlValue.trim() } : s
        )
      );
      setEditUrlOpen(false);
    } catch (err) {
      setEditUrlError(err instanceof Error ? err.message : "Failed to update URL");
    } finally {
      setEditUrlSaving(false);
    }
  }

  async function handleDelete(sub: Subscription) {
    const confirmed = window.confirm(
      `Unsubscribe from "${sub.title ?? sub.feedTitle ?? sub.url}"?`
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
        <img src={url} alt="" className="size-4 rounded-sm shrink-0" />
      );
    }
    const letter = (name || "?")[0].toUpperCase();
    return (
      <span className="size-4 rounded-sm bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0">
        {letter}
      </span>
    );
  }

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader className="px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-lg bg-primary flex items-center justify-center">
            <Rss className="size-3.5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-base tracking-tight">Feedwise</span>
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
                    isActive={activeView === key && !activeFeedId}
                    onClick={() => navigate({ view: key, feedId: null })}
                    className="rounded-xl h-9 transition-all duration-150"
                  >
                    <Icon className={cn("size-4", key === "starred" && activeView === key && "text-yellow-500")} />
                    <span className="flex-1">{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Feed list */}
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
            <SidebarMenu>
              {subs.map((sub) => {
                const name = sub.title ?? sub.feedTitle ?? sub.url;
                return (
                  <SidebarMenuItem key={sub.id}>
                    <SidebarMenuButton
                      isActive={activeFeedId === sub.feedId}
                      onClick={() => navigate({ feedId: sub.feedId, view: "all" })}
                      className="group rounded-xl h-9 transition-all duration-150"
                    >
                      <FeedIcon url={sub.iconUrl} name={name} />
                      <span className="truncate flex-1 text-sm">{name}</span>
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
                        <DropdownMenuContent align="end" className="rounded-xl">
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); openRename(sub); }}
                          >
                            <Pencil className="size-4" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); openEditUrl(sub); }}
                          >
                            <Link className="size-4" />
                            Edit URL
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => { e.stopPropagation(); handleDelete(sub); }}
                          >
                            <Trash2 className="size-4" />
                            Unsubscribe
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-2 pb-3 space-y-1">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-xl"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <Sun className="size-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute size-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-xl"
            onClick={() => router.push("/settings")}
          >
            <Settings className="size-4" />
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-xl text-muted-foreground"
            onClick={() => signOut().then(() => router.push("/login"))}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </SidebarFooter>

      {/* Add Feed dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="rounded-2xl">
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
              className="rounded-xl resize-none text-sm"
            />
            <p className="text-xs text-muted-foreground">One URL per line for batch add</p>
            {addError && <p className="text-destructive text-sm whitespace-pre-line">{addError}</p>}
            <Button type="submit" className="w-full rounded-xl" disabled={adding || feedUrl.trim().length === 0}>
              {adding ? "Adding..." : "Subscribe"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="rounded-2xl">
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
                className="rounded-xl"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={renaming} className="flex-1 rounded-xl">
                {renaming ? "Saving..." : "Save"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl"
                onClick={() => setRenameOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit URL dialog */}
      <Dialog open={editUrlOpen} onOpenChange={setEditUrlOpen}>
        <DialogContent className="rounded-2xl">
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
                className="rounded-xl"
              />
            </div>
            {editUrlError && (
              <p className="text-destructive text-sm">{editUrlError}</p>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={editUrlSaving} className="flex-1 rounded-xl">
                {editUrlSaving ? "Saving..." : "Save"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl"
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
