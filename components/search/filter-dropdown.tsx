"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DropdownOption {
  id: string;
  label: string;
}

interface Props {
  label: string;
  /** When set, shows the active option's label inside the chip. */
  activeId?: string;
  /** Lazy loader; called on first open. Returns options for the menu. */
  loadOptions: () => Promise<DropdownOption[]>;
  onSelect: (id: string | undefined) => void;
}

export function FilterDropdown({ label, activeId, loadOptions, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<DropdownOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Lazy-load on first open.
  useEffect(() => {
    if (!open || options !== null || loading) return;
    setLoading(true);
    loadOptions()
      .then((opts) => setOptions(opts))
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, [open, options, loading, loadOptions]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);

  const active = activeId ? options?.find((o) => o.id === activeId) : undefined;
  const chipLabel = active?.label ?? label;

  return (
    <div ref={containerRef} className="relative inline-block">
      <div
        className={cn(
          "inline-flex items-center gap-1 h-6 rounded-full px-2 text-[11px] border transition-colors",
          activeId
            ? "bg-primary/10 border-primary/30 text-primary"
            : "bg-muted border-transparent hover:border-border text-muted-foreground",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 outline-none"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="truncate max-w-[120px]">{chipLabel}</span>
          {!activeId && <ChevronDown className="size-3" />}
        </button>
        {activeId && (
          <button
            type="button"
            aria-label={`Clear ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(undefined);
            }}
            className="inline-flex items-center hover:bg-primary/10 rounded-full p-[1px]"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="absolute left-0 top-full mt-1 z-50 min-w-[180px] max-h-[40vh] overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-md py-1"
        >
          {loading ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>
          ) : !options || options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No options.</div>
          ) : (
            options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={opt.id === activeId}
                onClick={() => {
                  onSelect(opt.id);
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors",
                  opt.id === activeId && "bg-accent",
                )}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
