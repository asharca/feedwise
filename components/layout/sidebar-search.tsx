"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn, proxyImg } from "@/lib/utils";

interface SearchHit {
  id: string;
  feedId: string;
  feedTitle: string | null;
  feedIconUrl: string | null;
  title: string | null;
  summary: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  isRead: boolean;
}

const DEBOUNCE_MS = 250;
const RESULT_LIMIT = 10;

/**
 * Sidebar search trigger + ⌘K floating command palette.
 *
 * The trigger lives in the sidebar; results render inside a centred dialog so
 * the dropdown is no longer pinned to the narrow sidebar column. ⌘/Ctrl+K
 * opens from anywhere; Esc closes.
 */
export function SidebarSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(searchParams.get("search") ?? "");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // Reset when the URL search param changes externally (e.g. sidebar click).
  useEffect(() => {
    setValue(searchParams.get("search") ?? "");
  }, [searchParams]);

  // Global ⌘K / Ctrl+K shortcut to open the palette.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Clear pending requests/timers on unmount.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    },
    []
  );

  const runSearch = useCallback(async (query: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const p = new URLSearchParams({ search: query, limit: String(RESULT_LIMIT) });
      const res = await fetch(`/api/articles?${p}`, { signal: controller.signal });
      if (!res.ok) return;
      const data = await res.json();
      if (controller.signal.aborted) return;
      if (data?.success) {
        setHits((data.data as SearchHit[]) ?? []);
        setActiveIndex(0);
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        // Soft-fail; no toast spam during keystrokes
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  function handleChange(next: string) {
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (next.trim().length === 0) {
      abortRef.current?.abort();
      setHits([]);
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(next.trim()), DEBOUNCE_MS);
  }

  function clearQuery() {
    setValue("");
    setHits([]);
    abortRef.current?.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    inputRef.current?.focus();
    if (searchParams.get("search")) {
      const p = new URLSearchParams(searchParams.toString());
      p.delete("search");
      router.replace(`${pathname}?${p.toString()}`);
    }
  }

  function openHit(hit: SearchHit) {
    setOpen(false);
    // Keep the user's current list scope intact — opening an article from
    // search shouldn't jump them into a different feed. On dashboard this
    // triggers the article drawer; on a 2-pane view it pops the article into
    // the right pane.
    const onReader = pathname === "/reader" || pathname.startsWith("/reader/");
    const target = onReader ? pathname : "/reader";
    const p = new URLSearchParams(onReader ? searchParams.toString() : "");
    p.delete("search");
    p.set("articleId", hit.id);
    router.push(`${target}?${p.toString()}`);
  }

  function commitFullSearch() {
    const q = value.trim();
    if (!q) return;
    setOpen(false);
    const p = new URLSearchParams();
    p.set("search", q);
    router.push(`/reader?${p.toString()}`);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[activeIndex];
      if (hit) openHit(hit);
      else commitFullSearch();
    }
  }

  const trimmed = value.trim();
  const showResults = trimmed.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 text-sm bg-muted rounded-md pl-2.5 pr-1.5 py-1.5 border border-transparent hover:border-border transition-colors text-muted-foreground/80"
      >
        <Search className="size-3.5 shrink-0" />
        <span className="flex-1 text-left truncate">
          {value || "Search articles…"}
        </span>
        <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-border bg-background px-1.5 text-[10px] font-medium text-muted-foreground/80">
          <span className="text-[11px]">⌘</span>K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="p-0 sm:max-w-xl w-[92vw] gap-0 top-[18%] -translate-y-0 overflow-hidden"
        >
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
            <Search className="size-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={onKey}
              placeholder="Search articles…"
              autoFocus
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground/60"
            />
            {value && (
              <button
                type="button"
                onClick={clearQuery}
                aria-label="Clear search"
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <X className="size-3.5" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground/80 shrink-0">
              Esc
            </kbd>
          </div>

          {showResults && (
            <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
              {loading && hits.length === 0 ? (
                <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Searching…
                </div>
              ) : hits.length === 0 ? (
                <div className="px-3 py-4 text-xs text-muted-foreground">No matches.</div>
              ) : (
                <ul role="listbox" aria-label="Search results" className="py-1">
                  {hits.map((hit, i) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        onMouseEnter={() => setActiveIndex(i)}
                        onClick={() => openHit(hit)}
                        role="option"
                        aria-selected={i === activeIndex}
                        className={cn(
                          "w-full text-left px-3 py-2 flex gap-2.5 items-start transition-colors",
                          i === activeIndex ? "bg-accent" : "hover:bg-accent/50",
                          hit.isRead && "opacity-70"
                        )}
                      >
                        {hit.feedIconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={proxyImg(hit.feedIconUrl)}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="size-4 rounded-sm shrink-0 mt-0.5"
                          />
                        ) : (
                          <div className="size-4 rounded-sm shrink-0 mt-0.5 bg-muted" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div
                            className={cn(
                              "text-[13px] leading-snug line-clamp-2",
                              !hit.isRead && "font-semibold"
                            )}
                          >
                            {hit.title ?? "(no title)"}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {hit.feedTitle ?? "Unknown feed"}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {showResults && hits.length > 0 && (
            <button
              type="button"
              onClick={commitFullSearch}
              className="w-full text-left px-3 py-2 text-xs font-medium border-t border-border text-primary hover:bg-primary/5 transition-colors"
            >
              See all results for &ldquo;{trimmed}&rdquo; →
            </button>
          )}

          {!showResults && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              Type to search articles across all your feeds.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
