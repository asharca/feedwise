"use client";

import { ChevronRight, FolderOpen, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { FeedItem } from "./feed-item";
import type { FeedItemActions } from "./feed-item";
import type { Folder, Subscription } from "./types";

export interface FolderGroupProps {
  folder: Folder;
  folderSubs: Subscription[];
  folders: Folder[];
  unreadCount: number;
  isCollapsed: boolean;
  isActiveFolder: boolean;
  activeFeedId: string | null;
  onToggle: (folderId: string) => void;
  onViewAll: (folder: Folder) => void;
  onRename: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
  feedActions: FeedItemActions;
}

export function SortableFolderGroup(props: FolderGroupProps) {
  const {
    folder,
    folderSubs,
    folders,
    unreadCount,
    isCollapsed,
    isActiveFolder,
    activeFeedId,
    onToggle,
    onViewAll,
    onRename,
    onDelete,
    feedActions,
  } = props;

  const sortable = useSortable({ id: folder.id });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <SidebarGroup>
        <SidebarGroupLabel
          className={cn(
            "group/folder flex items-center justify-between pr-1 text-xs uppercase tracking-wider text-muted-foreground/70",
            isActiveFolder && "bg-primary/10 text-foreground shadow-[inset_2px_0_0_var(--primary)]",
          )}
        >
          <button
            type="button"
            {...listeners}
            onClick={() => onToggle(folder.id)}
            aria-expanded={!isCollapsed}
            className="flex flex-1 min-w-0 cursor-grab items-center gap-1 rounded-sm outline-none select-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-sidebar-ring"
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
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium tabular-nums text-primary">
                {unreadCount}
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<button type="button" />}
                aria-label={`Actions for ${folder.name}`}
                title={`Actions for ${folder.name}`}
                className="size-5 inline-flex items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-accent hover:text-sidebar-accent-foreground aria-expanded:text-sidebar-accent-foreground outline-none focus-visible:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <MoreHorizontal className="size-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-md">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewAll(folder);
                  }}
                >
                  <FolderOpen className="size-4" />
                  View all in folder
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onRename(folder);
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
                    onDelete(folder);
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
                folderSubs.map((sub) => (
                  <FeedItem
                    key={sub.id}
                    sub={sub}
                    folders={folders}
                    isActive={activeFeedId === sub.feedId}
                    actions={feedActions}
                  />
                ))
              ) : (
                <li className="px-2 py-1 text-xs italic text-muted-foreground">
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
