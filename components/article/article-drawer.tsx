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
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // Move focus into the panel for keyboard users
    panelRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hidden && element.getClientRects().length > 0);

      if (focusable.length === 0) {
        e.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
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
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close article"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] cursor-default animate-in fade-in duration-150"
      />
      {/* Right panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Article reader"
        className="absolute inset-y-0 right-0 flex h-dvh max-h-dvh w-full flex-col overscroll-contain bg-background shadow-2xl outline-none animate-in slide-in-from-right duration-200 md:w-[min(900px,90vw)]"
      >
        {children}
      </div>
    </div>
  );
}
