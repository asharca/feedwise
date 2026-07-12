"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DropdownOption {
  id: string;
  label: string;
}

interface Props {
  label: string;
  align?: "start" | "end";
  /** When set, shows the active option's label inside the chip. */
  activeId?: string;
  /** Lazy loader; called on first open. Returns options for the menu. */
  loadOptions: () => Promise<DropdownOption[]>;
  onSelect: (id: string | undefined) => void;
}

export function FilterDropdown({ label, align = "start", activeId, loadOptions, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<DropdownOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const openPreferenceRef = useRef<"active" | "first" | "last">("active");
  const listboxId = useId();

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

  useEffect(() => {
    if (!open || !options?.length) return;

    const activeIndex = activeId ? options.findIndex((option) => option.id === activeId) : -1;
    const nextIndex =
      openPreferenceRef.current === "first"
        ? 0
        : openPreferenceRef.current === "last"
          ? options.length - 1
          : Math.max(activeIndex, 0);
    setHighlightedIndex(nextIndex);
  }, [activeId, open, options]);

  useEffect(() => {
    if (!open || highlightedIndex < 0) return;
    optionRefs.current[highlightedIndex]?.focus();
  }, [highlightedIndex, open]);

  const active = activeId ? options?.find((o) => o.id === activeId) : undefined;
  const chipLabel = active?.label ?? label;

  function openMenu(preference: "active" | "first" | "last") {
    openPreferenceRef.current = preference;
    setOpen(true);
  }

  function closeMenu({ restoreFocus = false } = {}) {
    setOpen(false);
    setHighlightedIndex(-1);
    if (restoreFocus) queueMicrotask(() => triggerRef.current?.focus());
  }

  function moveHighlight(nextIndex: number) {
    if (!options?.length) return;
    const wrappedIndex = (nextIndex + options.length) % options.length;
    setHighlightedIndex(wrappedIndex);
  }

  function selectOption(id: string) {
    onSelect(id);
    closeMenu({ restoreFocus: true });
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        openMenu("first");
        break;
      case "ArrowUp":
        event.preventDefault();
        openMenu("last");
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) closeMenu();
        else openMenu("active");
        break;
      case "Escape":
        if (!open) return;
        event.preventDefault();
        closeMenu({ restoreFocus: true });
        break;
    }
  }

  function handleOptionKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveHighlight(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveHighlight(index - 1);
        break;
      case "Home":
        event.preventDefault();
        moveHighlight(0);
        break;
      case "End":
        event.preventDefault();
        moveHighlight((options?.length ?? 1) - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (options?.[index]) selectOption(options[index].id);
        break;
      case "Escape":
        event.preventDefault();
        closeMenu({ restoreFocus: true });
        break;
      case "Tab":
        setOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <div
        className={cn(
          "inline-flex h-11 items-stretch overflow-hidden rounded-full border text-xs transition-colors md:h-10",
          activeId
            ? "bg-primary/10 border-primary/30 text-primary"
            : "bg-muted border-transparent hover:border-border text-muted-foreground",
        )}
      >
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (open ? closeMenu() : openMenu("active"))}
          onKeyDown={handleTriggerKeyDown}
          className="inline-flex h-full min-w-0 items-center gap-1.5 px-3 outline-none focus-visible:bg-accent focus-visible:text-accent-foreground"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
        >
          <span className="max-w-[120px] truncate">{chipLabel}</span>
          <ChevronDown className="size-3.5" />
        </button>
        {activeId && (
          <button
            type="button"
            aria-label={`Clear ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(undefined);
            }}
            className="inline-flex size-11 shrink-0 items-center justify-center border-l border-primary/20 outline-none hover:bg-primary/10 focus-visible:bg-accent md:size-10"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={label}
          aria-busy={loading}
          className={cn(
            "absolute top-full z-50 mt-1 max-h-[40vh] min-w-[180px] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-md",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {loading ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">Loading...</div>
          ) : !options || options.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">No options.</div>
          ) : (
            options.map((opt, index) => (
              <button
                key={opt.id}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                type="button"
                role="option"
                aria-selected={opt.id === activeId}
                tabIndex={index === highlightedIndex ? 0 : -1}
                onClick={() => selectOption(opt.id)}
                onFocus={() => setHighlightedIndex(index)}
                onMouseMove={() => setHighlightedIndex(index)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                className={cn(
                  "min-h-11 w-full px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-accent focus:bg-accent md:min-h-10 md:text-xs",
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
