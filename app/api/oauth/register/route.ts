import { registration } from "@/lib/oauth/authorization";
import { saveClient } from "@/lib/oauth/store";
import { digest, randomToken } from "@/lib/oauth/tokens";

export async function POST(req: Request) {
  const result = registration.safeParse(await req.json().catch(() => null));
  if (!result.success) return Response.json({ error: "invalid_client_metadata" }, { status: 400 });
  const { client_name, redirect_uris, token_endpoint_auth_method } = result.data;
  const client = {
    client_id: crypto.randomUUID(),
    client_name,
    redirect_uris,
    token_endpoint_auth_method,
  };
  const secret = token_endpoint_auth_method === "none" ? undefined : randomToken();
  await saveClient({ ...client, secretHash: secret && digest(secret) });
  return Response.json(
    {
      ...client,
      client_secret: secret,
      ...(secret && { client_secret_expires_at: 0 }),
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "mcp",
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
