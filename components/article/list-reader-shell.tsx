"use client";

import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

interface Props {
  hasActive: boolean;
  list: React.ReactNode;
  reader: React.ReactNode;
  className?: string;
}

// Deterministic spring (~280ms settle, no overshoot). Time-based so a heavy
// React commit during the run won't desync the animation.
const spring = { type: "spring" as const, duration: 0.3, bounce: 0 };

// Pixel width for the collapsed list column (24rem). Used as the motion
// target so the spring interpolates a single numeric property.
const LIST_NARROW_PX = 384;

/**
 * Shared layout for "list + reader" pages (reader main, history).
 *
 * Width transitions use motion's `animate` with explicit pixel values.
 * `layout` (FLIP) was tried first but mid-animation subtree re-renders
 * (skeleton → ArticleReader, grid → compact) triggered re-measurements
 * that snapped the spring partway through.
 */
export function ListReaderShell({ hasActive, list, reader, className }: Props) {
  return (
    <div className={cn("flex h-full overflow-hidden", className)}>
      <motion.div
        initial={false}
        animate={{ width: hasActive ? LIST_NARROW_PX : "100%" }}
        transition={spring}
        className={cn(
          "border-r border-border min-w-0 overflow-hidden shrink-0",
          // Keep one focused pane until the shell is wide enough to give both
          // the compact list and reader useful space alongside the app sidebar.
          // Width on wide screens is still handled by the spring above.
          hasActive ? "hidden xl:block" : "block",
        )}
      >
        {list}
      </motion.div>
      <AnimatePresence initial={false}>
        {hasActive && (
          <motion.div
            key="reader"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={spring}
            className="flex-1 min-w-0 overflow-hidden"
          >
            {reader}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
