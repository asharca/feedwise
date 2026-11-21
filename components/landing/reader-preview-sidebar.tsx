import { CircleDot, Flame, FolderOpen, Home, Rss, Star } from "lucide-react";
import { PREVIEW_FOLDERS } from "./reader-preview-data";

export function ReaderPreviewSidebar() {
  return (
    <div
      aria-label="订阅导航预览"
      className="hidden flex-col border-r border-border bg-sidebar p-2.5 text-left lg:flex"
    >
      <div className="mb-3 flex items-center gap-2 px-1.5 py-1">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary">
          <Rss className="size-3 text-primary-foreground" aria-hidden="true" />
        </span>
        <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
          Feedwise
        </span>
      </div>

      <ul className="space-y-0.5 text-xs">
        <li className="flex items-center justify-between rounded-md px-2 py-1.5 text-muted-foreground">
          <span className="flex items-center gap-2">
            <Home className="size-3.5" aria-hidden="true" />
            首页
          </span>
        </li>
        <li className="flex items-center justify-between rounded-md px-2 py-1.5 text-muted-foreground">
          <span className="flex items-center gap-2">
            <Flame className="size-3.5" aria-hidden="true" />
            全网热榜
          </span>
          <span className="font-mono text-[10px]">22+</span>
        </li>
        <li className="flex items-center justify-between rounded-md bg-sidebar-accent px-2 py-1.5 font-medium text-sidebar-accent-foreground">
          <span className="flex items-center gap-2">
            <CircleDot className="size-3.5 text-primary" aria-hidden="true" />
            全部未读
          </span>
          <span className="font-mono text-[11px] text-primary">18</span>
        </li>
        <li className="flex items-center justify-between rounded-md px-2 py-1.5 text-muted-foreground">
          <span className="flex items-center gap-2">
            <Star className="size-3.5" aria-hidden="true" />
            我的收藏
          </span>
          <span className="font-mono text-[11px]">6</span>
        </li>
      </ul>

      <div className="mt-4 space-y-3 border-t border-sidebar-border pt-3">
        {PREVIEW_FOLDERS.map((folder) => (
          <div key={folder.id}>
            <div className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-medium text-muted-foreground">
              <FolderOpen className="size-3" aria-hidden="true" />
              <span>{folder.name}</span>
            </div>
            <ul className="space-y-0.5 text-xs">
              {folder.feeds.map((feed) => (
                <li
                  key={feed.id}
                  className="flex items-center justify-between gap-1.5 rounded-md px-2 py-1 text-sidebar-foreground/90"
                >
                  <span className="truncate">{feed.title}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {feed.kind === "html" && (
                      <span className="rounded bg-muted px-1 font-mono text-[9px] text-muted-foreground">
                        CSS
                      </span>
                    )}
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {feed.unread}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
