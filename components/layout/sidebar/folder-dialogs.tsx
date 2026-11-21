"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query/api";
import { queryKeys } from "@/lib/query/keys";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Folder } from "./types";

export interface CreateFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateFolderDialog({ open, onOpenChange }: CreateFolderDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [validationError, setValidationError] = useState("");

  const createMutation = useMutation({
    mutationFn: (folderName: string) =>
      apiFetch<Folder>("/api/folders", {
        method: "POST",
        json: { name: folderName },
      }),
    onSuccess: (created) => {
      queryClient.setQueryData<Folder[]>(queryKeys.folders.all, (prev) =>
        prev ? [...prev, created] : [created],
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
      setName("");
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (open) {
      setValidationError("");
      createMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when dialog opens
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setValidationError("请输入文件夹名称");
      return;
    }
    setValidationError("");
    createMutation.mutate(trimmed);
  }

  const errorMessage =
    validationError || (createMutation.error instanceof Error ? createMutation.error.message : "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg">
        <DialogHeader>
          <DialogTitle>新建文件夹</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="folder-create-input">名称</Label>
            <Input
              id="folder-create-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：科技、新闻、博客"
              autoFocus
              className="rounded-md"
            />
          </div>
          {errorMessage && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={createMutation.isPending} className="flex-1 rounded-md">
              {createMutation.isPending ? "创建中…" : "创建"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="rounded-md"
              onClick={() => onOpenChange(false)}
            >
              取消
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
}

export function RenameFolderDialog({ open, target, onOpenChange }: RenameFolderDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [validationError, setValidationError] = useState("");

  const renameMutation = useMutation({
    mutationFn: ({ id, nextName }: { id: string; nextName: string }) =>
      apiFetch<unknown>(`/api/folders/${id}`, {
        method: "PATCH",
        json: { name: nextName },
      }),
    onSuccess: (_data, { id, nextName }) => {
      queryClient.setQueryData<Folder[]>(queryKeys.folders.all, (prev) =>
        prev?.map((f) => (f.id === id ? { ...f, name: nextName } : f)),
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (open) {
      setName(target?.name ?? "");
      setValidationError("");
      renameMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when dialog opens
  }, [open, target?.id]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setValidationError("请输入文件夹名称");
      return;
    }
    setValidationError("");
    renameMutation.mutate({ id: target.id, nextName: trimmed });
  }

  const errorMessage =
    validationError || (renameMutation.error instanceof Error ? renameMutation.error.message : "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg">
        <DialogHeader>
          <DialogTitle>重命名文件夹</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="folder-rename-input">名称</Label>
            <Input
              id="folder-rename-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="rounded-md"
            />
          </div>
          {errorMessage && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={renameMutation.isPending} className="flex-1 rounded-md">
              {renameMutation.isPending ? "保存中…" : "保存"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="rounded-md"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
