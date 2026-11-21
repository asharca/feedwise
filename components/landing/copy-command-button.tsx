"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyCommandButtonProps {
  text: string;
  className?: string;
}

export function CopyCommandButton({ text, className }: CopyCommandButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      window.clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        setCopied(true);
      } finally {
        document.body.removeChild(textarea);
      }
    }

    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "已复制部署命令" : "复制部署命令"}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background/80 px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {copied ? (
        <>
          <Check className="size-3.5 text-primary" aria-hidden="true" />
          <span>已复制</span>
        </>
      ) : (
        <>
          <Copy className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span>复制</span>
        </>
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? "命令已复制到剪贴板" : ""}
      </span>
    </button>
  );
}
