"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SearchPalette } from "@/components/search/search-palette";

/**
 * Sidebar search trigger + ⌘K floating command palette.
 *
 * Shell-only: opens the dialog and renders SearchPalette. All search/state/
 * nav logic lives in SearchPalette and its children.
 */
export function SidebarSearch() {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const initialQuery = searchParams.get("search") ?? "";

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 text-sm bg-muted rounded-md pl-2.5 pr-1.5 py-1.5 border border-transparent hover:border-border transition-colors text-muted-foreground/80"
      >
        <Search className="size-3.5 shrink-0" />
        <span className="flex-1 text-left truncate">
          {initialQuery || "Search articles…"}
        </span>
        <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-border bg-background px-1.5 text-[10px] font-medium text-muted-foreground/80">
          <span className="text-[11px]">⌘</span>K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="p-0 sm:max-w-xl w-[92vw] gap-0 top-[18%] -translate-y-0 overflow-hidden"
        >
          {open && (
            <SearchPalette initialQuery={initialQuery} onClose={() => setOpen(false)} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
