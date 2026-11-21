"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";

async function fetchAutoSummarizePreference(signal?: AbortSignal): Promise<boolean> {
  const response = await fetch("/api/email/llm/config", { signal });
  if (!response.ok) return false;
  const payload: unknown = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") return false;
  const record =
    "data" in payload && payload.data && typeof payload.data === "object" ? payload.data : payload;
  const enabled = "enabled" in record && Boolean(record.enabled);
  const autoSummarize = "autoSummarize" in record && Boolean(record.autoSummarize);
  return enabled && autoSummarize;
}

/**
 * The user's reader-level auto-summarize preference (LLM enabled AND opted
 * in). `null` until loaded — callers that auto-trigger summaries must treat
 * null as "don't trigger yet".
 */
export function useAutoSummarize(): boolean | null {
  const query = useQuery({
    queryKey: queryKeys.settings.llm(),
    queryFn: ({ signal }) => fetchAutoSummarizePreference(signal),
    retry: false,
  });

  if (query.isPending) return null;
  if (query.isError) return false;
  return query.data ?? false;
}
