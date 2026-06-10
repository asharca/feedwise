"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseFeedUrlLines } from "./parse-feed-urls";
import type { Subscription } from "./types";

export interface AddFeedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the refreshed subscription list after a successful add. */
  onSubsRefreshed: (subs: Subscription[]) => void;
}

export function AddFeedDialog({ open, onOpenChange, onSubsRefreshed }: AddFeedDialogProps) {
  const [feedUrl, setFeedUrl] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAddFeed(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    setAdding(true);
    try {
      const urls = parseFeedUrlLines(feedUrl);
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
      if (failed === 0) onOpenChange(false);
      const subsRes = await fetch("/api/feeds");
      const subsData = await subsRes.json();
      if (subsData.success) onSubsRefreshed(subsData.data);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add feed");
    } finally {
      setAdding(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
  );
}
