"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Subscription } from "./types";

export interface RenameFeedDialogProps {
  open: boolean;
  target: Subscription | null;
  onOpenChange: (open: boolean) => void;
  /** Called with the new custom title (null = cleared) after a successful save. */
  onRenamed: (subscriptionId: string, title: string | null) => void;
}

export function RenameFeedDialog({ open, target, onOpenChange, onRenamed }: RenameFeedDialogProps) {
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    if (open) {
      setRenameName(target?.title ?? target?.feedTitle ?? "");
    }
  }, [open, target]);

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setRenaming(true);
    try {
      const res = await fetch(`/api/feeds/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customTitle: renameName.trim() || null }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onRenamed(target.id, renameName.trim() || null);
      onOpenChange(false);
    } finally {
      setRenaming(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg">
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
              placeholder={target?.feedTitle ?? "Feed name"}
              autoFocus
              className="rounded-md"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={renaming} className="flex-1 rounded-md">
              {renaming ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="rounded-md"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
