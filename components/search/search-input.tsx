"use client";

import { forwardRef } from "react";
import { Search, X } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** id of the currently active result row, for aria-activedescendant. */
  activeDescendantId?: string;
}

export const SearchInput = forwardRef<HTMLInputElement, Props>(function SearchInput(
  { value, onChange, onClear, onKeyDown, activeDescendantId },
  ref,
) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
      <Search className="size-4 text-muted-foreground shrink-0" />
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search articles, feeds, tags…"
        autoFocus
        role="combobox"
        aria-expanded={value.trim().length > 0}
        aria-autocomplete="list"
        aria-controls="sp-results"
        aria-activedescendant={activeDescendantId}
        className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground/60"
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
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
  );
});
