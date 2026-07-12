"use client";

import { useCallback } from "react";
import { FilterDropdown, type DropdownOption } from "./filter-dropdown";
import { cn } from "@/lib/utils";
import type { SearchFilters } from "@/lib/hooks/use-search";

interface Props {
  filters: SearchFilters;
  onSetFilter: (key: "feedId" | "folderId" | "tagId" | "since", value: string | undefined) => void;
  onToggleFilter: (key: "unread" | "starred") => void;
  onClearAll: () => void;
}

async function loadFeeds(): Promise<DropdownOption[]> {
  const res = await fetch("/api/feeds");
  if (!res.ok) return [];
  const body = await res.json();
  if (!body?.success) return [];
  type Sub = { feedId: string; title: string | null; feedTitle: string | null };
  return (body.data as Sub[])
    .map((s) => ({ id: s.feedId, label: s.title ?? s.feedTitle ?? "(untitled)" }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function loadFolders(): Promise<DropdownOption[]> {
  const res = await fetch("/api/folders");
  if (!res.ok) return [];
  const body = await res.json();
  if (!body?.success) return [];
  type Folder = { id: string; name: string };
  return (body.data as Folder[])
    .map((f) => ({ id: f.id, label: f.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function loadTags(): Promise<DropdownOption[]> {
  const res = await fetch("/api/tags");
  if (!res.ok) return [];
  const body = await res.json();
  if (!body?.success) return [];
  type Tag = { id: string; name: string };
  return (body.data as Tag[])
    .map((t) => ({ id: t.id, label: "#" + t.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const SINCE_OPTIONS: DropdownOption[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Past 7 days" },
  { id: "30d", label: "Past 30 days" },
];

export function SearchFilterBar({ filters, onSetFilter, onToggleFilter, onClearAll }: Props) {
  const loadSince = useCallback(async () => SINCE_OPTIONS, []);

  const anyActive =
    !!filters.feedId ||
    !!filters.folderId ||
    !!filters.tagId ||
    !!filters.since ||
    filters.unread ||
    filters.starred;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
      <FilterDropdown
        label="Feed"
        activeId={filters.feedId}
        loadOptions={loadFeeds}
        onSelect={(v) => onSetFilter("feedId", v)}
      />
      <FilterDropdown
        label="Folder"
        activeId={filters.folderId}
        loadOptions={loadFolders}
        onSelect={(v) => onSetFilter("folderId", v)}
      />
      <FilterDropdown
        label="Tag"
        activeId={filters.tagId}
        loadOptions={loadTags}
        onSelect={(v) => onSetFilter("tagId", v)}
      />
      <FilterDropdown
        label="Date"
        align="end"
        activeId={filters.since}
        loadOptions={loadSince}
        onSelect={(v) => onSetFilter("since", v)}
      />
      <button
        type="button"
        onClick={() => onToggleFilter("unread")}
        className={cn(
          "inline-flex h-11 items-center rounded-full border px-3 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-10",
          filters.unread
            ? "bg-primary/10 border-primary/30 text-primary"
            : "bg-muted border-transparent hover:border-border text-muted-foreground",
        )}
      >
        Unread
      </button>
      <button
        type="button"
        onClick={() => onToggleFilter("starred")}
        className={cn(
          "inline-flex h-11 items-center rounded-full border px-3 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-10",
          filters.starred
            ? "bg-primary/10 border-primary/30 text-primary"
            : "bg-muted border-transparent hover:border-border text-muted-foreground",
        )}
      >
        Starred
      </button>
      {anyActive && (
        <button
          type="button"
          onClick={onClearAll}
          className="ml-auto inline-flex h-11 items-center px-2 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:h-10"
        >
          Clear
        </button>
      )}
    </div>
  );
}
