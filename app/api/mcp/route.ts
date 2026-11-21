import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/server";
import { oauthOrigin } from "@/lib/oauth/metadata";
import { accessGrant, getClient } from "@/lib/oauth/store";

export const runtime = "nodejs";
async function handle(request: Request) {
  const origin = oauthOrigin(request);
  const bearer = /^Bearer ([a-zA-Z0-9_-]{43})$/i.exec(request.headers.get("authorization") ?? "");
  const grant = bearer && (await accessGrant(bearer[1], `${origin}/api/mcp`));
  if (!grant)
    return Response.json(
      { error: "invalid_token" },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"`,
          "Cache-Control": "no-store",
        },
      },
    );
  const browserOrigin = request.headers.get("origin");
  if (browserOrigin !== null && browserOrigin !== origin) {
    const client = await getClient(grant.clientId);
    if (
      browserOrigin === "null" ||
      !client?.redirect_uris.some((uri) => new URL(uri).origin === browserOrigin)
    ) {
      return Response.json({ error: "Invalid origin" }, { status: 403 });
    }
  }
  // Stateless JSON mode has neither a standalone SSE stream nor sessions to delete.
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createMcpServer(grant.userId);
  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}
export { handle as GET, handle as POST, handle as DELETE };
