"use client";

import {
  Pencil,
  Link,
  Trash2,
  MoreHorizontal,
  FolderOpen,
  AlertTriangle,
  CheckCheck,
  RefreshCw,
} from "lucide-react";
import {
  SidebarMenuButton,
  SidebarMenuItem,
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
import { proxyImg } from "@/lib/utils";
import type { Subscription, Folder } from "./types";

export interface FeedItemActions {
  onNavigate: (sub: Subscription) => void;
  onMarkAllRead: (sub: Subscription) => void;
  onRefresh: (sub: Subscription) => void;
  onRename: (sub: Subscription) => void;
  onEditUrl: (sub: Subscription) => void;
  onMoveToFolder: (sub: Subscription, folderId: string | null) => void;
  onDelete: (sub: Subscription) => void;
}

export interface FeedItemProps {
  sub: Subscription;
  folders: Folder[];
  isActive: boolean;
  actions: FeedItemActions;
}

function FeedIcon({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={proxyImg(url, 96)}
        alt=""
        loading="lazy"
        decoding="sync"
        className="size-4 rounded-sm shrink-0 transform-gpu backface-hidden"
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

export function FeedItem({ sub, folders, isActive, actions }: FeedItemProps) {
  const name = sub.title ?? sub.feedTitle ?? sub.url;
  return (
    <SidebarMenuItem key={sub.id}>
      <SidebarMenuButton
        isActive={isActive}
        onClick={() => actions.onNavigate(sub)}
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
                    actions.onMarkAllRead(sub);
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
                actions.onRefresh(sub);
              }}
            >
              <RefreshCw className="size-4" />
              {sub.lastFetchError ? "Retry now" : "Refresh now"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                actions.onRename(sub);
              }}
            >
              <Pencil className="size-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                actions.onEditUrl(sub);
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
                    actions.onMoveToFolder(sub, null);
                  }}
                >
                  No folder
                </DropdownMenuItem>
                {folders.length > 0 && <DropdownMenuSeparator />}
                {folders.map((f) => (
                  <DropdownMenuItem
                    key={f.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      actions.onMoveToFolder(sub, f.id);
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
                actions.onDelete(sub);
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
