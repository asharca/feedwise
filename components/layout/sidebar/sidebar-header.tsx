"use client";

import { Download, FolderOpen, Plus, Rss, Sparkles, X } from "lucide-react";
import { SidebarHeader, useSidebar } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export interface SidebarHeaderSectionProps {
  onOpenAiSearch: () => void;
  onOpenAddFeed: () => void;
  onOpenCreateFolder: () => void;
}

export function SidebarHeaderSection({
  onOpenAiSearch,
  onOpenAddFeed,
  onOpenCreateFolder,
}: SidebarHeaderSectionProps) {
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarHeader className="px-3 py-3">
      <div className="flex items-center gap-2 px-1">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary">
          <Rss className="size-3.5 text-primary-foreground" />
        </div>
        <span className="flex-1 text-base font-semibold tracking-tight">Feedwise</span>
        <button
          type="button"
          onClick={onOpenAiSearch}
          aria-label="AI 问答"
          title="AI 问答"
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-primary focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <Sparkles className="size-3.5" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<button type="button" />}
            aria-label="添加订阅或文件夹"
            title="添加订阅或文件夹"
            className="inline-flex size-6 items-center justify-center rounded-md outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <Plus className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-md">
            <DropdownMenuItem onClick={onOpenAddFeed}>
              <Rss className="size-4" />
              添加订阅
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenCreateFolder}>
              <FolderOpen className="size-4" />
              新建文件夹
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                window.location.href = "/api/opml/export";
              }}
            >
              <Download className="size-4" />
              导出 OPML
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-6 rounded-md md:hidden"
          onClick={() => setOpenMobile(false)}
          aria-label="关闭侧边栏"
          title="关闭侧边栏"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </SidebarHeader>
  );
}
