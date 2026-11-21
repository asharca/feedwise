"use client";

import {
  AlertTriangle,
  CheckCheck,
  Film,
  FolderOpen,
  Headphones,
  Image as ImageIcon,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import type { ContentView } from "@/lib/db/schema-types";
import { SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
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
import { CONTENT_VIEW_LABELS, getEffectiveView } from "./content-view-meta";
import { FeedIcon } from "./feed-icon";
import type { Folder, Subscription } from "./types";

const VIEW_ICON_MAP: Partial<Record<ContentView, typeof ImageIcon>> = {
  social: MessageSquare,
  picture: ImageIcon,
  video: Film,
  audio: Headphones,
};

export interface FeedItemActions {
  onNavigate: (sub: Subscription) => void;
  onMarkAllRead: (sub: Subscription) => void;
  onRefresh: (sub: Subscription) => void;
  onOpenSettings: (sub: Subscription) => void;
  onMoveToFolder: (sub: Subscription, folderId: string | null) => void;
  onDelete: (sub: Subscription) => void;
}

export interface FeedItemProps {
  sub: Subscription;
  folders: Folder[];
  isActive: boolean;
  actions: FeedItemActions;
}

export function FeedItem({ sub, folders, isActive, actions }: FeedItemProps) {
  const name = sub.title || sub.feedTitle || sub.url;
  const effectiveView = getEffectiveView(sub);
  const ViewIcon = effectiveView !== "article" ? VIEW_ICON_MAP[effectiveView] : undefined;

  return (
    <SidebarMenuItem key={sub.id}>
      <SidebarMenuButton
        isActive={isActive}
        onClick={() => actions.onNavigate(sub)}
        className="group h-8 rounded-md transition-colors duration-150"
      >
        <FeedIcon url={sub.iconUrl} siteUrl={sub.siteUrl} feedUrl={sub.url} name={name} />
        <span className="flex-1 truncate text-sm">{name}</span>
        {ViewIcon && (
          <span
            title={`显示方式：${CONTENT_VIEW_LABELS[effectiveView]}`}
            aria-label={`显示方式：${CONTENT_VIEW_LABELS[effectiveView]}`}
            className="inline-flex shrink-0 items-center text-muted-foreground/70"
          >
            <ViewIcon className="size-3" aria-hidden="true" />
          </span>
        )}
        {sub.lastFetchError && (
          <span
            title={
              (sub.consecutiveFailures ?? 0) > 1
                ? `${sub.lastFetchError}（连续失败 ${sub.consecutiveFailures} 次）`
                : sub.lastFetchError
            }
            className="inline-flex shrink-0 items-center gap-0.5"
          >
            <AlertTriangle className="size-3 text-destructive/70" />
            {(sub.consecutiveFailures ?? 0) >= 3 && (
              <span className="text-xs font-medium tabular-nums text-destructive">
                {sub.consecutiveFailures}
              </span>
            )}
          </span>
        )}
        {sub.unreadCount != null && sub.unreadCount > 0 && (
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium tabular-nums text-primary">
            {sub.unreadCount}
          </span>
        )}
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<SidebarMenuAction showOnHover />}
          aria-label={`${name} 操作`}
          title={`${name} 操作`}
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
                全部标为已读
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
            {sub.lastFetchError ? "立即重试" : "立即刷新"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              actions.onOpenSettings(sub);
            }}
          >
            <SlidersHorizontal className="size-4" />
            订阅设置
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderOpen className="size-4" />
              移动到文件夹
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  actions.onMoveToFolder(sub, null);
                }}
                disabled={sub.folderId === null}
              >
                未分类
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
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              actions.onDelete(sub);
            }}
          >
            <Trash2 className="size-4" />
            取消订阅
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
