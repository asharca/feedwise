// tests/api/r.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/email/click-token", () => ({ verifyClickToken: vi.fn() }));
vi.mock("@/lib/db/queries/articles", () => ({ getArticleUrlById: vi.fn(), markArticle: vi.fn() }));

import { GET } from "@/app/api/r/route";
import { verifyClickToken } from "@/lib/email/click-token";
import { getArticleUrlById, markArticle } from "@/lib/db/queries/articles";

const APP = "http://localhost:3000";
beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = APP;
});

function req(t?: string) {
  return new Request(`http://localhost/api/r${t ? `?t=${t}` : ""}`);
}

describe("GET /api/r", () => {
  it("stars the article and redirects to its url on a valid token", async () => {
    vi.mocked(verifyClickToken).mockReturnValue({ userId: "u1", articleId: "art1" });
    vi.mocked(getArticleUrlById).mockResolvedValue("https://news.example/story");
    const res = await GET(req("tok"));
    expect(markArticle).toHaveBeenCalledWith("u1", "art1", { isStarred: true });
    expect(res.headers.get("location")).toBe("https://news.example/story");
  });

  it("redirects to app home on an invalid token and does not star", async () => {
    vi.mocked(verifyClickToken).mockReturnValue(null);
    const res = await GET(req("bad"));
    expect(markArticle).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe(APP + "/");
  });

  it("redirects home when the article is unknown", async () => {
    vi.mocked(verifyClickToken).mockReturnValue({ userId: "u1", articleId: "missing" });
    vi.mocked(getArticleUrlById).mockResolvedValue(null);
    const res = await GET(req("tok"));
    expect(res.headers.get("location")).toBe(APP + "/");
  });

  it("still redirects to the article when starring fails", async () => {
    vi.mocked(verifyClickToken).mockReturnValue({ userId: "u1", articleId: "art1" });
    vi.mocked(getArticleUrlById).mockResolvedValue("https://news.example/story");
    vi.mocked(markArticle).mockRejectedValue(new Error("db down"));
    const res = await GET(req("tok"));
    expect(res.headers.get("location")).toBe("https://news.example/story");
  });
});
