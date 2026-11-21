"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/query/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface CitedArticle {
  id: string;
  title: string;
  feedTitle: string;
  url: string | null;
  summary: string;
}

interface AiSearchResponse {
  answer: string;
  articles: CitedArticle[];
}

interface AiSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AiSearchDialog({ open, onOpenChange }: AiSearchDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const searchMutation = useMutation({
    mutationFn: (q: string) =>
      apiFetch<AiSearchResponse>("/api/search/ai", {
        method: "POST",
        json: { query: q },
      }),
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "AI 问答失败");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    searchMutation.mutate(q);
  }

  function handleSelectArticle(id: string) {
    onOpenChange(false);
    router.push(`/reader?articleId=${id}`);
  }

  const answer = searchMutation.data?.answer ?? null;
  const cited = searchMutation.data?.articles ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[90vw] max-w-2xl flex-col overflow-hidden rounded-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            AI 订阅问答
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="询问近期订阅内容，例如：「最近 AI Agent 有哪些新进展？」"
            rows={2}
            autoFocus
            className="w-full resize-none rounded-md bg-muted px-3 py-2 text-sm outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit(e as unknown as React.FormEvent);
              }
            }}
          />
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              className="rounded-md"
              disabled={searchMutation.isPending || query.trim().length < 2}
            >
              {searchMutation.isPending ? "思考中…" : "提问"}
            </Button>
            <span className="self-center text-[11px] text-muted-foreground">⌘+Enter 提交</span>
          </div>
        </form>

        {(answer || cited.length > 0) && (
          <div className="mt-2 flex-1 space-y-4 overflow-y-auto scrollbar-thin">
            {answer && (
              <div className="rounded-md border border-primary/20 bg-primary/5 px-4 py-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{answer}</p>
              </div>
            )}
            {cited.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  引用文章
                </p>
                {cited.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => handleSelectArticle(a.id)}
                    className="w-full rounded-md border border-border px-3 py-2 text-left transition-colors hover:border-primary/40"
                  >
                    <div className="text-xs text-muted-foreground">{a.feedTitle}</div>
                    <div className="mt-0.5 line-clamp-2 text-sm font-medium leading-snug">
                      {a.title}
                    </div>
                    {a.summary && (
                      <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {a.summary}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
