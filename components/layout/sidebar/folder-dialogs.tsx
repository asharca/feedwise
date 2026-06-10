"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Folder } from "./types";

export interface CreateFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (folder: Folder) => void;
}

export function CreateFolderDialog({ open, onOpenChange, onCreated }: CreateFolderDialogProps) {
  const [folderCreateName, setFolderCreateName] = useState("");
  const [folderCreateSaving, setFolderCreateSaving] = useState(false);
  const [folderCreateError, setFolderCreateError] = useState("");

  async function handleFolderCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = folderCreateName.trim();
    if (!name) {
      setFolderCreateError("Name is required");
      return;
    }
    setFolderCreateSaving(true);
    setFolderCreateError("");
    try {
      const res = await fetch(`/api/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as {
        success: boolean;
        error?: string;
        data?: { id: string; name: string; position?: number | null };
      };
      if (!data.success || !data.data) throw new Error(data.error ?? "Failed to create");
      onCreated({ id: data.data.id, name: data.data.name });
      setFolderCreateName("");
      onOpenChange(false);
    } catch (err) {
      setFolderCreateError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setFolderCreateSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg">
        <DialogHeader>
          <DialogTitle>New Folder</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleFolderCreate} className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="folder-create-input">Name</Label>
            <Input
              id="folder-create-input"
              value={folderCreateName}
              onChange={(e) => setFolderCreateName(e.target.value)}
              placeholder="e.g. Tech, News, Friends"
              autoFocus
              className="rounded-md"
            />
          </div>
          {folderCreateError && <p className="text-destructive text-sm">{folderCreateError}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={folderCreateSaving} className="flex-1 rounded-md">
              {folderCreateSaving ? "Creating…" : "Create"}
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

export interface RenameFolderDialogProps {
  open: boolean;
  target: Folder | null;
  onOpenChange: (open: boolean) => void;
  onRenamed: (folderId: string, name: string) => void;
}

export function RenameFolderDialog({
  open,
  target,
  onOpenChange,
  onRenamed,
}: RenameFolderDialogProps) {
  const [folderRenameName, setFolderRenameName] = useState("");
  const [folderRenameSaving, setFolderRenameSaving] = useState(false);
  const [folderRenameError, setFolderRenameError] = useState("");

  useEffect(() => {
    if (open) {
      setFolderRenameName(target?.name ?? "");
      setFolderRenameError("");
    }
  }, [open, target]);

  async function handleFolderRename(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    const name = folderRenameName.trim();
    if (!name) {
      setFolderRenameError("Name is required");
      return;
    }
    setFolderRenameSaving(true);
    setFolderRenameError("");
    try {
      const res = await fetch(`/api/folders/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) throw new Error(data.error ?? "Failed to rename");
      onRenamed(target.id, name);
      onOpenChange(false);
    } catch (err) {
      setFolderRenameError(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      setFolderRenameSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg">
        <DialogHeader>
          <DialogTitle>Rename Folder</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleFolderRename} className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="folder-rename-input">Name</Label>
            <Input
              id="folder-rename-input"
              value={folderRenameName}
              onChange={(e) => setFolderRenameName(e.target.value)}
              autoFocus
              className="rounded-md"
            />
          </div>
          {folderRenameError && <p className="text-destructive text-sm">{folderRenameError}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={folderRenameSaving} className="flex-1 rounded-md">
              {folderRenameSaving ? "Saving…" : "Save"}
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
