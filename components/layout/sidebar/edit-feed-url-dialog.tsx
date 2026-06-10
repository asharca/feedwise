"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Subscription } from "./types";

export interface EditFeedUrlDialogProps {
  open: boolean;
  target: Subscription | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (subscriptionId: string, url: string) => void;
}

export function EditFeedUrlDialog({ open, target, onOpenChange, onSaved }: EditFeedUrlDialogProps) {
  const [editUrlValue, setEditUrlValue] = useState("");
  const [editUrlSaving, setEditUrlSaving] = useState(false);
  const [editUrlError, setEditUrlError] = useState("");

  useEffect(() => {
    if (open) {
      setEditUrlValue(target?.url ?? "");
      setEditUrlError("");
    }
  }, [open, target]);

  async function handleEditUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setEditUrlSaving(true);
    setEditUrlError("");
    try {
      const res = await fetch(`/api/feeds/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedUrl: editUrlValue.trim() }),
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) throw new Error(data.error ?? "Failed to update URL");
      onSaved(target.id, editUrlValue.trim());
      onOpenChange(false);
    } catch (err) {
      setEditUrlError(err instanceof Error ? err.message : "Failed to update URL");
    } finally {
      setEditUrlSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg">
        <DialogHeader>
          <DialogTitle>Edit Feed URL</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleEditUrl} className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-url-input">Feed URL</Label>
            <Input
              id="edit-url-input"
              value={editUrlValue}
              onChange={(e) => setEditUrlValue(e.target.value)}
              placeholder="https://example.com/feed.xml"
              type="url"
              required
              autoFocus
              className="rounded-md"
            />
          </div>
          {editUrlError && <p className="text-destructive text-sm">{editUrlError}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={editUrlSaving} className="flex-1 rounded-md">
              {editUrlSaving ? "Saving…" : "Save"}
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
