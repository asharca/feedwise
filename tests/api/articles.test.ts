import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));
vi.mock("@/lib/db/queries/articles", () => ({
  getArticles: vi.fn(),
}));

import { requireSession } from "@/lib/auth/session";
import { getArticles } from "@/lib/db/queries/articles";
import { GET } from "@/app/api/articles/route";

const mockSession = { user: { id: "user-1" } };

beforeEach(() => {
  vi.mocked(requireSession).mockReset();
  vi.mocked(getArticles).mockReset();
  vi.mocked(requireSession).mockResolvedValue(mockSession as never);
  vi.mocked(getArticles).mockResolvedValue([]);
});

function callGet(query: string) {
  return GET(new Request(`https://test.local/api/articles?${query}`), {
    params: Promise.resolve({}),
  });
}

describe("GET /api/articles", () => {
  it("converts the reader date token into a chronological cutoff", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T00:00:00.000Z"));

    const response = await callGet("search=rust&since=7d");

    expect(response.status).toBe(200);
    expect(getArticles).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        search: "rust",
        since: new Date("2026-07-05T00:00:00.000Z"),
      }),
    );
    vi.useRealTimers();
  });

  it("rejects an invalid date filter", async () => {
    const response = await callGet("since=last-century");
    expect(response.status).toBe(400);
    expect(getArticles).not.toHaveBeenCalled();
  });
});
