"use client";

import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DigestPreviewResult } from "@/components/settings/types";
import { apiFetch } from "@/lib/query/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logId: string | null;
}

export function EmailPreviewDialog({ open, onOpenChange, logId }: Props) {
  const previewQuery = useQuery({
    queryKey: ["settings", "email", "history", logId, "preview"] as const,
    queryFn: () => apiFetch<DigestPreviewResult>(`/api/settings/email/history/${logId}/preview`),
    enabled: open && Boolean(logId),
  });

  const data = previewQuery.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-none rounded-lg w-[min(1100px,96vw)] h-[min(88vh,820px)] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 flex-wrap pr-6">
            <span>邮件预览</span>
            {data && (
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                共 {data.articleCount} 篇文章
                {data.sentAt
                  ? ` · ${formatDistanceToNow(new Date(data.sentAt), { addSuffix: true, locale: zhCN })}`
                  : ""}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden rounded-md border border-border bg-background relative">
          {previewQuery.isFetching && (
            <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-center py-2 bg-background/80 backdrop-blur-sm text-xs text-muted-foreground">
              <div className="size-3 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin mr-2" />
              正在加载预览…
            </div>
          )}
          {previewQuery.isError ? (
            <div className="flex items-center justify-center h-full text-sm text-destructive p-6 text-center">
              {previewQuery.error instanceof Error ? previewQuery.error.message : "预览加载失败"}
            </div>
          ) : data?.html ? (
            <iframe
              title="邮件预览"
              srcDoc={data.html}
              sandbox=""
              className="w-full h-full bg-white"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              正在生成预览…
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
