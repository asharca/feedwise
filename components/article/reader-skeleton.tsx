/**
 * Placeholder shown in the reader pane while an article's detail is
 * fetched. Rendering this immediately on click (instead of waiting for the
 * fetch) lets the list→reader animation start without perceived lag.
 *
 * Stateless and visual-only — no `"use client"` directive needed, which
 * also avoids Next's serializable-prop check on client-entry components.
 */
export function ReaderSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="h-[42px] shrink-0 border-b border-border/50" />
      <div className="flex-1 overflow-hidden p-8 space-y-4">
        <div className="h-7 w-3/4 rounded bg-muted animate-pulse" />
        <div className="h-4 w-1/3 rounded bg-muted animate-pulse" />
        <div className="space-y-2 pt-4">
          <div className="h-3 w-full rounded bg-muted/60 animate-pulse" />
          <div className="h-3 w-full rounded bg-muted/60 animate-pulse" />
          <div className="h-3 w-5/6 rounded bg-muted/60 animate-pulse" />
          <div className="h-3 w-4/6 rounded bg-muted/60 animate-pulse" />
          <div className="h-3 w-full rounded bg-muted/60 animate-pulse" />
          <div className="h-3 w-3/4 rounded bg-muted/60 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
