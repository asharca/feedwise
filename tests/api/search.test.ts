import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));
vi.mock("@/lib/db/queries/search", () => ({
  searchArticles: vi.fn(),
  searchFeedsByName: vi.fn(),
  searchTagsByName: vi.fn(),
}));

import { requireSession } from "@/lib/auth/session";
import { searchArticles, searchFeedsByName, searchTagsByName } from "@/lib/db/queries/search";
import { GET } from "@/app/api/search/route";

const mockSession = { user: { id: "user-1" } };

beforeEach(() => {
  vi.mocked(requireSession).mockReset();
  vi.mocked(searchArticles).mockReset();
  vi.mocked(searchFeedsByName).mockReset();
  vi.mocked(searchTagsByName).mockReset();
});

function makeReq(qs: string): Request {
  return new Request("https://test.local/api/search?" + qs);
}

describe("GET /api/search", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireSession).mockRejectedValueOnce(new Error("nope"));
    const res = await GET(makeReq("q=async"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when q is missing", async () => {
    vi.mocked(requireSession).mockResolvedValueOnce(mockSession as never);
    const res = await GET(makeReq(""));
    expect(res.status).toBe(400);
  });

  it("returns 400 when q is empty after trim", async () => {
    vi.mocked(requireSession).mockResolvedValueOnce(mockSession as never);
    const res = await GET(makeReq("q=%20%20"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when q is too long", async () => {
    vi.mocked(requireSession).mockResolvedValueOnce(mockSession as never);
    const res = await GET(makeReq("q=" + "a".repeat(501)));
    expect(res.status).toBe(400);
  });

  it("returns combined results on success", async () => {
    vi.mocked(requireSession).mockResolvedValueOnce(mockSession as never);
    vi.mocked(searchArticles).mockResolvedValueOnce([
      {
        id: "a1",
        feedId: "f1",
        feedTitle: "Feed",
        feedIconUrl: null,
        title: "Async Rust",
        titleParts: [{ type: "text", value: "Async Rust" }],
        snippetParts: [{ type: "match", value: "async" }],
        isRead: false,
        isStarred: false,
        publishedAt: null,
      },
    ]);
    vi.mocked(searchFeedsByName).mockResolvedValueOnce([
      { feedId: "f1", title: "Async Weekly", iconUrl: null, unreadCount: 2 },
    ]);
    vi.mocked(searchTagsByName).mockResolvedValueOnce([
      { id: "t1", name: "async", color: null, articleCount: 4 },
    ]);

    const res = await GET(makeReq("q=async"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.query).toBe("async");
    expect(body.data.articles).toHaveLength(1);
    expect(body.data.feeds).toHaveLength(1);
    expect(body.data.tags).toHaveLength(1);
  });

  it("isolates errors per query (failing tags → empty tags)", async () => {
    vi.mocked(requireSession).mockResolvedValueOnce(mockSession as never);
    vi.mocked(searchArticles).mockResolvedValueOnce([]);
    vi.mocked(searchFeedsByName).mockResolvedValueOnce([]);
    vi.mocked(searchTagsByName).mockRejectedValueOnce(new Error("boom"));

    const res = await GET(makeReq("q=async"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.tags).toEqual([]);
  });
});
