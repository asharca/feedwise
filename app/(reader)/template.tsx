"use client";

import { MotionConfig } from "motion/react";

/**
 * Wraps every reader-group page. Two jobs:
 *  1. `MotionConfig reducedMotion="user"` — JS-driven springs (list↔reader
 *     width, reader slide-in) are inline-transform based, so the CSS
 *     prefers-reduced-motion guard can't reach them; this does.
 *  2. A restrained cross-page fade. Templates remount only on segment changes
 *     (not search params), so in-page ?articleId/?view nav keeps its state.
 *
 * Keyed at the group level, this fades Home ↔ Discover ↔ Settings. The
 * reader/ template handles reader ↔ history ↔ tags.
 */
export default function ReaderTemplate({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="h-full animate-in fade-in duration-300 ease-[var(--ease-out)] motion-reduce:animate-none">
        {children}
      </div>
    </MotionConfig>
  );
}
