import { oauthOrigin } from "@/lib/oauth/metadata";
import { tokenStore } from "@/lib/oauth/store";
import { exchangeToken } from "@/lib/oauth/tokens";

export async function POST(req: Request) {
  const headers = new Headers({ "Cache-Control": "no-store", Pragma: "no-cache" });
  if (
    req.headers.get("content-type")?.split(";")[0].trim() !== "application/x-www-form-urlencoded"
  ) {
    return Response.json({ error: "invalid_request" }, { status: 400, headers });
  }
  const params = new URLSearchParams(await req.text());
  const result = await exchangeToken(
    params,
    req.headers.get("authorization"),
    `${oauthOrigin(req)}/api/mcp`,
    tokenStore,
  );
  if (result.status === 401) headers.set("WWW-Authenticate", 'Basic realm="Feedwise"');
  return Response.json(result.body, { status: result.status, headers });
}
