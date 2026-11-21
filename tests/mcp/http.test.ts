// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/oauth/store", () => ({ accessGrant: vi.fn(), getClient: vi.fn() }));
import { accessGrant } from "@/lib/oauth/store";
import { GET, POST, DELETE } from "@/app/api/mcp/route";

const url = "https://feedwise.test/api/mcp";
afterEach(() => {
  vi.unstubAllEnvs();
});
it.each([GET, POST, DELETE])(
  "requires an OAuth bearer and advertises discovery",
  async (handle) => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://feedwise.test");
    vi.mocked(accessGrant).mockResolvedValue(null);
    for (const authorization of ["", "Basic xxxx", `Bearer ${"A".repeat(43)}`]) {
      const res = await handle(new Request(url, { headers: { authorization } }));
      expect(res.status).toBe(401);
      expect(res.headers.get("WWW-Authenticate")).toBe(
        'Bearer resource_metadata="https://feedwise.test/.well-known/oauth-protected-resource/api/mcp"',
      );
    }
  },
);
it("initializes a stateless JSON transport with no cookie or MCP session", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://feedwise.test");
  vi.mocked(accessGrant).mockResolvedValue({ userId: "u", clientId: "c", resource: url });
  const res = await POST(
    new Request(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${"A".repeat(43)}`,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          clientInfo: { name: "test", version: "1" },
          capabilities: {},
        },
      }),
    }),
  );
  expect(res.status).toBe(200);
  expect(res.headers.has("mcp-session-id")).toBe(false);
  expect(await res.json()).toMatchObject({ id: 1, result: { serverInfo: { name: "feedwise" } } });
});
