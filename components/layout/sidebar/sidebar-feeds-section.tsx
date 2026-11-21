"use client";

import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { FeedItem, type FeedItemActions } from "./feed-item";
import { SortableFolderGroup } from "./folder-group";
import type { FolderGroupData } from "./use-sidebar-data";
import type { Folder, Subscription } from "./types";

export interface SidebarFeedsSectionProps {
  folders: Folder[];
  folderGroups: FolderGroupData[];
  uncategorized: Subscription[];
  activeFeedId: string | null;
  activeFolderId: string | null;
  onReorderFolders: (next: Folder[]) => void;
  onViewFolder: (folder: Folder) => void;
  onRenameFolder: (folder: Folder) => void;
  onDeleteFolder: (folder: Folder) => void;
  onOpenAddFeed: () => void;
  feedActions: FeedItemActions;
}

export function SidebarFeedsSection({
  folders,
  folderGroups,
  uncategorized,
  activeFeedId,
  activeFolderId,
  onReorderFolders,
  onViewFolder,
  onRenameFolder,
  onDeleteFolder,
  onOpenAddFeed,
  feedActions,
}: SidebarFeedsSectionProps) {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function toggleFolder(folderId: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  function handleFolderDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = folders.findIndex((f) => f.id === active.id);
    const newIndex = folders.findIndex((f) => f.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorderFolders(arrayMove(folders, oldIndex, newIndex));
  }

  return (
    <>
      <DndContext
        sensors={dndSensors}
        collisionDetection={closestCenter}
        onDragEnd={handleFolderDragEnd}
      >
        <SortableContext items={folders.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          {folderGroups.map(({ folder, subs, unreadCount }) => (
            <SortableFolderGroup
              key={folder.id}
              folder={folder}
              folderSubs={subs}
              folders={folders}
              unreadCount={unreadCount}
              isCollapsed={collapsedFolders.has(folder.id)}
              isActiveFolder={activeFolderId === folder.id && !activeFeedId}
              activeFeedId={activeFeedId}
              onToggle={toggleFolder}
              onViewAll={onViewFolder}
              onRename={onRenameFolder}
              onDelete={onDeleteFolder}
              feedActions={feedActions}
            />
          ))}
        </SortableContext>
      </DndContext>

      {uncategorized.length > 0 && (
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center justify-between pr-1 text-xs uppercase tracking-wider text-muted-foreground/70">
            订阅源
            <button
              type="button"
              onClick={onOpenAddFeed}
              aria-label="添加订阅"
              title="添加订阅"
              className="inline-flex size-5 items-center justify-center rounded-md outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
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
                  folders={folders}
                  isActive={activeFeedId === sub.feedId}
                  actions={feedActions}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}
    </>
  );
}
