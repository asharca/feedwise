import { useEffect, useState } from "react";

/**
 * The user's reader-level auto-summarize preference (LLM enabled AND opted
 * in). `null` until loaded — callers that auto-trigger summaries must treat
 * null as "don't trigger yet".
 */
export function useAutoSummarize(): boolean | null {
  const [autoSummarize, setAutoSummarize] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/email/llm/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setAutoSummarize(data ? Boolean(data.enabled) && Boolean(data.autoSummarize) : false);
      })
      .catch(() => {
        if (!cancelled) setAutoSummarize(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return autoSummarize;
}
