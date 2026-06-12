"use client";

import { Loader2 } from "lucide-react";
import { cn, proxyImg } from "@/lib/utils";
import { SearchSnippet } from "./search-snippet";
import type { ArticleHitDTO, FeedHitDTO, TagHitDTO } from "@/lib/hooks/use-search";

export interface ResultsProps {
  query: string;
  loading: boolean;
  articles: ArticleHitDTO[];
  feeds: FeedHitDTO[];
  tags: TagHitDTO[];
  activeKey: string | null;
  getRowId: (key: string | null) => string | undefined;
  onActivate: (key: string) => void;
  onOpenArticle: (a: ArticleHitDTO) => void;
  onOpenFeed: (f: FeedHitDTO) => void;
  onOpenTag: (t: TagHitDTO) => void;
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
      {label}
    </div>
  );
}

function ArticleRow({
  id,
  hit,
  active,
  onActivate,
  onOpen,
}: {
  id?: string;
  hit: ArticleHitDTO;
  active: boolean;
  onActivate: () => void;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        id={id}
        type="button"
        role="option"
        aria-selected={active}
        onMouseEnter={onActivate}
        onClick={onOpen}
        className={cn(
          "w-full text-left px-3 py-2 flex gap-2.5 items-start transition-colors",
          active ? "bg-accent" : "hover:bg-accent/50",
          hit.isRead && "opacity-70",
        )}
      >
        {hit.feedIconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyImg(hit.feedIconUrl, 96)}
            alt=""
            loading="lazy"
            decoding="sync"
            className="size-4 rounded-sm shrink-0 mt-0.5 img-gpu"
          />
        ) : (
          <div className="size-4 rounded-sm shrink-0 mt-0.5 bg-muted" />
        )}
        <div className="min-w-0 flex-1">
          <div
            className={cn("text-[13px] leading-snug line-clamp-2", !hit.isRead && "font-semibold")}
          >
            {hit.titleParts.length > 0 ? (
              <SearchSnippet parts={hit.titleParts} />
            ) : (
              (hit.title ?? "(no title)")
            )}
          </div>
          <SearchSnippet
            parts={hit.snippetParts}
            matchedOnly
            className="block text-[11px] text-muted-foreground/90 line-clamp-2 mt-0.5"
          />
          <div className="text-[11px] text-muted-foreground/70 truncate mt-0.5">
            {hit.feedTitle ?? "Unknown feed"}
          </div>
        </div>
      </button>
    </li>
  );
}

function FeedRow({
  id,
  hit,
  active,
  onActivate,
  onOpen,
}: {
  id?: string;
  hit: FeedHitDTO;
  active: boolean;
  onActivate: () => void;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        id={id}
        type="button"
        role="option"
        aria-selected={active}
        onMouseEnter={onActivate}
        onClick={onOpen}
        className={cn(
          "w-full text-left px-3 py-1.5 flex gap-2.5 items-center transition-colors",
          active ? "bg-accent" : "hover:bg-accent/50",
        )}
      >
        {hit.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyImg(hit.iconUrl, 96)}
            alt=""
            loading="lazy"
            decoding="sync"
            className="size-4 rounded-sm shrink-0 img-gpu"
          />
        ) : (
          <div className="size-4 rounded-sm shrink-0 bg-muted" />
        )}
        <span className="text-[13px] flex-1 truncate">{hit.title ?? "(untitled feed)"}</span>
        {hit.unreadCount > 0 && (
          <span className="text-[10px] text-muted-foreground/70">{hit.unreadCount}</span>
        )}
      </button>
    </li>
  );
}

function TagRow({
  id,
  hit,
  active,
  onActivate,
  onOpen,
}: {
  id?: string;
  hit: TagHitDTO;
  active: boolean;
  onActivate: () => void;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        id={id}
        type="button"
        role="option"
        aria-selected={active}
        onMouseEnter={onActivate}
        onClick={onOpen}
        className={cn(
          "w-full text-left px-3 py-1.5 flex gap-2 items-center transition-colors",
          active ? "bg-accent" : "hover:bg-accent/50",
        )}
      >
        <span
          className="size-2 rounded-full shrink-0"
          style={{ backgroundColor: hit.color ?? "var(--muted-foreground)" }}
        />
        <span className="text-[13px] flex-1 truncate">#{hit.name}</span>
        <span className="text-[10px] text-muted-foreground/70">{hit.articleCount}</span>
      </button>
    </li>
  );
}

export function SearchResults(props: ResultsProps) {
  const { query, loading, articles, feeds, tags, activeKey } = props;

  const empty = articles.length === 0 && feeds.length === 0 && tags.length === 0;

  let content: React.ReactNode;

  if (query.trim().length === 0) {
    content = (
      <div className="px-3 py-6 text-center text-xs text-muted-foreground">
        Type to search articles, feeds, and tags.
      </div>
    );
  } else if (loading && empty) {
    content = (
      <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Searching…
      </div>
    );
  } else if (empty) {
    content = <div className="px-3 py-4 text-xs text-muted-foreground">No matches.</div>;
  } else {
    content = (
      <div className="max-h-[60vh] overflow-y-auto scrollbar-thin pb-1">
        {articles.length > 0 && (
          <>
            <SectionHeader label="Articles" />
            <ul role="listbox" aria-label="Articles">
              {articles.map((a) => (
                <ArticleRow
                  key={a.id}
                  id={props.getRowId("article:" + a.id)}
                  hit={a}
                  active={activeKey === "article:" + a.id}
                  onActivate={() => props.onActivate("article:" + a.id)}
                  onOpen={() => props.onOpenArticle(a)}
                />
              ))}
            </ul>
          </>
        )}
        {feeds.length > 0 && (
          <>
            <SectionHeader label="Feeds" />
            <ul role="listbox" aria-label="Feeds">
              {feeds.map((f) => (
                <FeedRow
                  key={f.feedId}
                  id={props.getRowId("feed:" + f.feedId)}
                  hit={f}
                  active={activeKey === "feed:" + f.feedId}
                  onActivate={() => props.onActivate("feed:" + f.feedId)}
                  onOpen={() => props.onOpenFeed(f)}
                />
              ))}
            </ul>
          </>
        )}
        {tags.length > 0 && (
          <>
            <SectionHeader label="Tags" />
            <ul role="listbox" aria-label="Tags">
              {tags.map((t) => (
                <TagRow
                  key={t.id}
                  id={props.getRowId("tag:" + t.id)}
                  hit={t}
                  active={activeKey === "tag:" + t.id}
                  onActivate={() => props.onActivate("tag:" + t.id)}
                  onOpen={() => props.onOpenTag(t)}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  return <div id="sp-results">{content}</div>;
}
