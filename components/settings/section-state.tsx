"use client";

import { useState } from "react";
import { AlertCircle, Check, Copy, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function SectionLoadingState({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-24 items-center gap-3 rounded-md border border-border bg-muted/40 px-4 py-3"
    >
      <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
      <p className="text-sm font-medium">正在加载{label}…</p>
    </div>
  );
}

export function SectionErrorState({
  label,
  error,
  onRetry,
}: {
  label: string;
  error: unknown;
  onRetry: () => void;
}) {
  const message = error instanceof Error ? error.message : "未知错误";
  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex min-h-24 items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">无法加载{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{message}。其他设置仍可正常使用。</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-9 shrink-0 rounded-md"
        onClick={onRetry}
      >
        <RefreshCw className="size-3.5" />
        重试
      </Button>
    </div>
  );
}

export function CopyButton({
  value,
  label = "复制",
  copiedLabel = "已复制",
  className,
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("已复制到剪贴板");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("复制失败，请手动复制");
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className ?? "rounded-md shrink-0"}
      onClick={handleCopy}
    >
      {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
      {copied ? copiedLabel : label}
    </Button>
  );
}
