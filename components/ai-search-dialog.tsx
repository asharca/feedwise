"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface CitedArticle {
  id: string;
  title: string;
  feedTitle: string;
  url: string | null;
  summary: string;
}

interface AiSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AiSearchDialog({ open, onOpenChange }: AiSearchDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [cited, setCited] = useState<CitedArticle[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    setLoading(true);
    setAnswer(null);
    setCited([]);
    try {
      const res = await fetch("/api/search/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = (await res.json()) as {
        success: boolean;
        error?: string;
        data?: { answer: string; articles: CitedArticle[] };
      };
      if (!data.success || !data.data) {
        toast.error(data.error ?? "AI search failed");
        return;
      }
      setAnswer(data.data.answer);
      setCited(data.data.articles ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI search failed");
    } finally {
      setLoading(false);
    }
  }

  function handleSelectArticle(id: string) {
    onOpenChange(false);
    router.push(`/reader?articleId=${id}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg max-w-2xl w-[90vw] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Ask your feed
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask about recent articles, e.g. &quot;What's new with AI agents?&quot;"
            rows={2}
            autoFocus
            className="w-full text-sm bg-muted rounded-md px-3 py-2 outline-none resize-none"
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
              disabled={loading || query.trim().length < 2}
            >
              {loading ? "Thinking…" : "Ask"}
            </Button>
            <span className="text-[11px] text-muted-foreground self-center">⌘+Enter to submit</span>
          </div>
        </form>

        {(answer || cited.length > 0) && (
          <div className="flex-1 overflow-y-auto scrollbar-thin space-y-4 mt-2">
            {answer && (
              <div className="rounded-md border border-primary/20 bg-primary/5 px-4 py-3">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{answer}</p>
              </div>
            )}
            {cited.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  Cited articles
                </p>
                {cited.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => handleSelectArticle(a.id)}
                    className="w-full text-left rounded-md border border-border px-3 py-2 hover:border-primary/40 transition-colors"
                  >
                    <div className="text-xs text-muted-foreground">{a.feedTitle}</div>
                    <div className="text-sm font-medium leading-snug mt-0.5 line-clamp-2">
                      {a.title}
                    </div>
                    {a.summary && (
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
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
