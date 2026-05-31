"use client";

import { useEffect, useRef } from "react";

interface ArticleDrawerProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Right-side sliding drawer used to read a dashboard-launched article without
 * losing the magazine context underneath. Esc, backdrop click, or the article
 * reader's own back button all dismiss it.
 *
 * Why custom instead of base-ui Dialog: we want a side-anchored slide-in (not
 * a centered modal) with full-height layout and we need to pass through the
 * existing ArticleReader as the body — both awkward to express via Dialog.
 */
export function ArticleDrawer({ open, onClose, children }: ArticleDrawerProps) {
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // Move focus into the panel for keyboard users
    panelRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);

    // Stop the page underneath from scrolling while the drawer is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close article"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] cursor-default animate-in fade-in duration-150"
      />
      {/* Right panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute right-0 top-0 bottom-0 w-full md:w-[min(900px,90vw)] bg-background shadow-2xl outline-none animate-in slide-in-from-right duration-200 flex flex-col"
      >
        {children}
      </div>
    </div>
  );
}
