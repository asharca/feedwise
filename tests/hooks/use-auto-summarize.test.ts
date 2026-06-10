import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAutoSummarize } from "@/lib/hooks/use-auto-summarize";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
}

describe("useAutoSummarize", () => {
  it("is null until the config loads, then true when enabled + opted in", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse({ enabled: true, autoSummarize: true }));
    const { result } = renderHook(() => useAutoSummarize());
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith("/api/email/llm/config");
  });

  it("is false when LLM is enabled but auto-summarize is off", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse({ enabled: true, autoSummarize: false }));
    const { result } = renderHook(() => useAutoSummarize());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("is false when the request fails", async () => {
    fetchMock.mockReturnValueOnce(Promise.reject(new Error("network")));
    const { result } = renderHook(() => useAutoSummarize());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("is false when the response is not ok", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse({}, false));
    const { result } = renderHook(() => useAutoSummarize());
    await waitFor(() => expect(result.current).toBe(false));
  });
});
