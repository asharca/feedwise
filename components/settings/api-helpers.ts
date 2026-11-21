import { ApiError } from "@/lib/query/api";

/**
 * Legacy LLM routes (/api/email/llm/config, /models, /test) return flat JSON
 * rather than the `{ success, data }` envelope. This helper supports both
 * formats cleanly so TanStack Query hooks stay uniform.
 */
export async function fetchLlmJson<T>(
  input: string,
  init: { method?: string; json?: unknown } = {},
): Promise<T> {
  const { method = "GET", json } = init;
  const response = await fetch(input, {
    method,
    headers: json === undefined ? undefined : { "Content-Type": "application/json" },
    body: json === undefined ? undefined : JSON.stringify(json),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON response handled below
  }

  const record =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;

  if (!response.ok || record?.success === false || record?.ok === false) {
    const message =
      typeof record?.error === "string" ? record.error : `请求失败（HTTP ${response.status}）`;
    throw new ApiError(message, response.status, record);
  }

  if (record && "success" in record && "data" in record) {
    return record.data as T;
  }
  return payload as T;
}

/**
 * Trigger a browser download for the user's OPML export blob.
 */
export async function downloadOpmlExport(): Promise<void> {
  const response = await fetch("/api/opml/export");
  if (!response.ok) {
    throw new Error(`导出订阅失败（HTTP ${response.status}）`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "feedwise-subscriptions.opml";
  a.click();
  URL.revokeObjectURL(url);
}
