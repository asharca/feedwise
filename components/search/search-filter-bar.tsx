"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query/api";
import { queryKeys } from "@/lib/query/keys";
import { FilterDropdown, type DropdownOption } from "./filter-dropdown";
import { cn } from "@/lib/utils";
import type { SearchFilters } from "@/lib/hooks/use-search";

interface Props {
  filters: SearchFilters;
  onSetFilter: (key: "feedId" | "folderId" | "tagId" | "since", value: string | undefined) => void;
  onToggleFilter: (key: "unread" | "starred") => void;
  onClearAll: () => void;
}

interface SubOption {
  feedId: string;
  title: string | null;
  feedTitle: string | null;
}

interface FolderOption {
  id: string;
  name: string;
}

interface TagOption {
  id: string;
  name: string;
}

const SINCE_OPTIONS: DropdownOption[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Past 7 days" },
  { id: "30d", label: "Past 30 days" },
];

export function SearchFilterBar({ filters, onSetFilter, onToggleFilter, onClearAll }: Props) {
  const [feedsEnabled, setFeedsEnabled] = useState(false);
  const [foldersEnabled, setFoldersEnabled] = useState(false);
  const [tagsEnabled, setTagsEnabled] = useState(false);

  const feedsQuery = useQuery({
    queryKey: queryKeys.feeds.list(),
    queryFn: ({ signal }) => apiFetch<SubOption[]>("/api/feeds", { signal }),
    enabled: feedsEnabled || Boolean(filters.feedId),
  });

  const foldersQuery = useQuery({
    queryKey: queryKeys.folders.all,
    queryFn: ({ signal }) => apiFetch<FolderOption[]>("/api/folders", { signal }),
    enabled: foldersEnabled || Boolean(filters.folderId),
  });

  const tagsQuery = useQuery({
    queryKey: queryKeys.tags.all,
    queryFn: ({ signal }) => apiFetch<TagOption[]>("/api/tags", { signal }),
    enabled: tagsEnabled || Boolean(filters.tagId),
  });

  const feedOptions = useMemo<DropdownOption[]>(
    () =>
      (feedsQuery.data ?? [])
        .map((s) => ({ id: s.feedId, label: s.title || s.feedTitle || "(untitled)" }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [feedsQuery.data],
  );

  const folderOptions = useMemo<DropdownOption[]>(
    () =>
      (foldersQuery.data ?? [])
        .map((f) => ({ id: f.id, label: f.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [foldersQuery.data],
  );

  const tagOptions = useMemo<DropdownOption[]>(
    () =>
      (tagsQuery.data ?? [])
        .map((t) => ({ id: t.id, label: "#" + t.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [tagsQuery.data],
  );

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
        options={feedOptions}
        loading={feedsQuery.isLoading}
        onOpenChange={(open) => {
          if (open) setFeedsEnabled(true);
        }}
        onSelect={(v) => onSetFilter("feedId", v)}
      />
      <FilterDropdown
        label="Folder"
        activeId={filters.folderId}
        options={folderOptions}
        loading={foldersQuery.isLoading}
        onOpenChange={(open) => {
          if (open) setFoldersEnabled(true);
        }}
        onSelect={(v) => onSetFilter("folderId", v)}
      />
      <FilterDropdown
        label="Tag"
        activeId={filters.tagId}
        options={tagOptions}
        loading={tagsQuery.isLoading}
        onOpenChange={(open) => {
          if (open) setTagsEnabled(true);
        }}
        onSelect={(v) => onSetFilter("tagId", v)}
      />
      <FilterDropdown
        label="Date"
        align="end"
        activeId={filters.since}
        options={SINCE_OPTIONS}
        onSelect={(v) => onSetFilter("since", v)}
      />
      <button
        type="button"
        onClick={() => onToggleFilter("unread")}
        className={cn(
          "inline-flex h-11 items-center rounded-full border px-3 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-10",
          filters.unread
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-transparent bg-muted text-muted-foreground hover:border-border",
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
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-transparent bg-muted text-muted-foreground hover:border-border",
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
