import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));

import { requireSession } from "@/lib/auth/session";
import { withAuth } from "@/lib/api/with-auth";

const mockSession = { user: { id: "user-1" } };

beforeEach(() => {
  vi.mocked(requireSession).mockReset();
});

describe("withAuth", () => {
  it("returns 401 when requireSession rejects", async () => {
    vi.mocked(requireSession).mockRejectedValueOnce(new Error("nope"));
    const handler = withAuth(async () => Response.json({ success: true }));
    const res = await handler(new Request("https://t.local/api/x"), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: "Unauthorized" });
  });

  it("passes session and ctx through to the handler", async () => {
    vi.mocked(requireSession).mockResolvedValueOnce(mockSession as never);
    const seen: unknown[] = [];
    const handler = withAuth(async (_req, session, ctx) => {
      seen.push(session, await ctx.params);
      return Response.json({ success: true });
    });
    const res = await handler(new Request("https://t.local/api/x"), {
      params: Promise.resolve({ id: "42" }),
    });
    expect(res.status).toBe(200);
    expect(seen).toEqual([mockSession, { id: "42" }]);
  });

  it("maps ZodError to 400", async () => {
    vi.mocked(requireSession).mockResolvedValueOnce(mockSession as never);
    const handler = withAuth(async () => {
      z.object({ q: z.string() }).parse({});
      return Response.json({ success: true });
    });
    const res = await handler(new Request("https://t.local/api/x"), { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
  });

  it("maps unexpected errors to 500 with a generic message", async () => {
    vi.mocked(requireSession).mockResolvedValueOnce(mockSession as never);
    const handler = withAuth(async () => {
      throw new Error("secret detail");
    });
    const res = await handler(new Request("https://t.local/api/x"), { params: Promise.resolve({}) });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal error"); // detail must not leak
  });
});
