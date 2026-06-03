"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDistanceToNow } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logId: string | null;
}

export function EmailPreviewDialog({ open, onOpenChange, logId }: Props) {
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ articleCount: number; sentAt: string } | null>(null);

  useEffect(() => {
    if (!open || !logId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHtml("");
    setMeta(null);
    fetch(`/api/settings/email/history/${logId}/preview`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.success) {
          setError(data.error ?? "Preview failed");
          return;
        }
        setHtml(data.data.html);
        setMeta({ articleCount: data.data.articleCount, sentAt: data.data.sentAt });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Preview failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, logId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!max-w-none rounded-lg w-[min(1100px,96vw)] h-[min(88vh,820px)] overflow-hidden flex flex-col"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 flex-wrap pr-6">
            <span>Email preview</span>
            {meta && (
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                {meta.articleCount} article{meta.articleCount === 1 ? "" : "s"}
                {" · "}
                {formatDistanceToNow(new Date(meta.sentAt), { addSuffix: true })}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden rounded-md border border-border bg-background relative">
          {loading && (
            <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-center py-2 bg-background/80 backdrop-blur-sm text-xs text-muted-foreground">
              <div className="size-3 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin mr-2" />
              Loading…
            </div>
          )}
          {error ? (
            <div className="flex items-center justify-center h-full text-sm text-destructive p-6 text-center">
              {error}
            </div>
          ) : html ? (
            <iframe
              title="Email preview"
              srcDoc={html}
              sandbox=""
              className="w-full h-full bg-white"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Building preview…
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
