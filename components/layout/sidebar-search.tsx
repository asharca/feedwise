"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";
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
 * Sidebar search with an inline live-result dropdown anchored to the input.
 *
 * Why a dropdown (not URL-driven 2-pane swap): typing in the old version
 * rewrote the URL on every keystroke, which collapsed the dashboard, swapped
 * layouts, and gave a stuttery feel. Now keystrokes only show suggestions
 * below the input; the user picks an article or hits Enter to commit to a
 * full search view (?search=…) — same destination, much smoother trip.
 */
export function SidebarSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [value, setValue] = useState(searchParams.get("search") ?? "");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // Reset when the URL search param changes externally (e.g. sidebar click).
  useEffect(() => {
    setValue(searchParams.get("search") ?? "");
  }, [searchParams]);

  // Clear pending requests/timers on unmount.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    },
    []
  );

  // Close dropdown on outside click.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("pointerdown", onPointerDown);
      return () => document.removeEventListener("pointerdown", onPointerDown);
    }
  }, [open]);

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
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (next.trim().length === 0) {
      abortRef.current?.abort();
      setHits([]);
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(next.trim()), DEBOUNCE_MS);
  }

  function clear() {
    setValue("");
    setHits([]);
    setOpen(false);
    abortRef.current?.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    inputRef.current?.focus();
    // If we were on a URL-committed search view, drop the param so the user
    // returns to the previous list/dashboard.
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
      setOpen(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[activeIndex];
      if (hit) openHit(hit);
      else commitFullSearch();
    } else if (e.key === "Escape") {
      if (open) {
        setOpen(false);
      } else {
        clear();
      }
    }
  }

  const showDropdown = open && value.trim().length > 0;

  return (
    <div ref={containerRef} className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => value.trim() && setOpen(true)}
        onKeyDown={onKey}
        placeholder="Search articles…"
        className="w-full text-sm bg-muted rounded-md pl-8 pr-7 py-1.5 outline-none border border-transparent focus:border-border placeholder:text-muted-foreground/60"
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="size-3.5" />
        </button>
      )}

      {showDropdown && (
        <div className="absolute left-0 right-0 mt-1.5 z-50 rounded-md border border-border bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/5 overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
            {loading && hits.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Searching…
              </div>
            ) : hits.length === 0 ? (
              <div className="px-3 py-3 text-xs text-muted-foreground">No matches.</div>
            ) : (
              <ul role="listbox" aria-label="Search results">
                {hits.map((hit, i) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => openHit(hit)}
                      role="option"
                      aria-selected={i === activeIndex}
                      className={cn(
                        "w-full text-left px-3 py-2 flex gap-2 items-start transition-colors",
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
          {hits.length > 0 && (
            <button
              type="button"
              onClick={commitFullSearch}
              className="w-full text-left px-3 py-2 text-xs font-medium border-t border-border text-primary hover:bg-primary/5 transition-colors"
            >
              See all results for &ldquo;{value.trim()}&rdquo; →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
