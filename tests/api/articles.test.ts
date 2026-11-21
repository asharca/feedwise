import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));
vi.mock("@/lib/db/queries/articles", () => ({
  getArticles: vi.fn(),
  getReadingHistory: vi.fn(),
}));

import { requireSession } from "@/lib/auth/session";
import { getArticles, getReadingHistory } from "@/lib/db/queries/articles";
import { GET as history } from "@/app/api/articles/history/route";
import { encodeCursor } from "@/lib/search/article-cursor";
import { GET } from "@/app/api/articles/route";

const mockSession = { user: { id: "user-1" } };

beforeEach(() => {
  vi.mocked(requireSession).mockReset();
  vi.mocked(getArticles).mockReset();
  vi.mocked(requireSession).mockResolvedValue(mockSession as never);
  vi.mocked(getArticles).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(getReadingHistory).mockReset().mockResolvedValue({ items: [], nextCursor: null });
});

function callGet(query: string) {
  return GET(new Request(`https://test.local/api/articles?${query}`), {
    params: Promise.resolve({}),
  });
}

describe("GET /api/articles", () => {
  it("defaults to 50 results with no offset and returns the page envelope", async () => {
    const res = await callGet("offset=99");
    expect(await res.json()).toEqual({ success: true, data: { items: [], nextCursor: null } });
    const filter = vi.mocked(getArticles).mock.calls[0][1];
    expect(filter).toMatchObject({ limit: 50 });
    expect(filter).not.toHaveProperty("offset");
  });

  it("passes the decoded cursor and view and caps the page size", async () => {
    const key = { at: "2026-07-12T00:00:00.000032Z", id: "aa009b6b-b650-492c-a63c-fce090496e4e" };
    const res = await callGet(`cursor=${encodeCursor(key)}&view=picture&limit=180`);
    expect(res.status).toBe(200);
    expect(getArticles).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ cursor: key, view: "picture", limit: 100 }),
    );
  });

  it.each(["view=invalid", "cursor=***", "limit=-1", "limit=5z"])(
    "rejects invalid %s",
    async (qs) => {
      expect((await callGet(qs)).status).toBe(400);
      expect(getArticles).not.toHaveBeenCalled();
    },
  );

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

describe("GET /api/articles/history", () => {
  const get = (qs: string) =>
    history(new Request(`https://test.local/api/articles/history?${qs}`), {
      params: Promise.resolve({}),
    });

  it("uses the same page contract while preserving history search", async () => {
    const key = { at: "2026-07-12T15:10:00.009000Z", id: "aa009b6b-b650-492c-a63c-fce090496e4e" };
    const res = await get(`cursor=${encodeCursor(key)}&search=%20猫%20`);
    expect(getReadingHistory).toHaveBeenCalledWith("user-1", {
      search: "猫",
      cursor: key,
      limit: 50,
    });
    expect(await res.json()).toEqual({ success: true, data: { items: [], nextCursor: null } });
  });

  it("rejects malformed cursors", async () => {
    expect((await get("cursor=e30")).status).toBe(400);
    expect(getReadingHistory).not.toHaveBeenCalled();
  });
});
