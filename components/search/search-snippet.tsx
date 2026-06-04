"use client";

import { cn } from "@/lib/utils";
import type { SnippetPart } from "@/lib/search/parse-snippet";

interface Props {
  parts: SnippetPart[];
  className?: string;
  /** When true, renders nothing if no `match` parts are present. */
  matchedOnly?: boolean;
}

export function SearchSnippet({ parts, className, matchedOnly }: Props) {
  if (parts.length === 0) return null;
  if (matchedOnly && !parts.some((p) => p.type === "match")) return null;
  return (
    <span className={cn("inline", className)}>
      {parts.map((p, i) =>
        p.type === "match" ? (
          <mark
            key={i}
            className="bg-yellow-200/60 dark:bg-yellow-500/30 text-foreground px-0.5 rounded-[2px]"
          >
            {p.value}
          </mark>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </span>
  );
}
