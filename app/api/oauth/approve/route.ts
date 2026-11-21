import { withAuth } from "@/lib/api/with-auth";
import { authorization, callbackUrl, validApproval } from "@/lib/oauth/authorization";
import { oauthOrigin } from "@/lib/oauth/metadata";
import { getClient, saveAuthCode } from "@/lib/oauth/store";
import { randomToken } from "@/lib/oauth/tokens";
import { z } from "zod";

const approval = authorization.extend({ deny: z.boolean().optional() });
export const POST = withAuth(async (req, session) => {
  const origin = oauthOrigin(req);
  if (
    req.headers.get("origin") !== origin ||
    req.headers.get("content-type")?.split(";")[0] !== "application/json"
  ) {
    return Response.json({ error: "invalid_request" }, { status: 403 });
  }
  const parsed = approval.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const params = parsed.data,
    resource = `${origin}/api/mcp`;
  const client = await getClient(params.client_id);
  if (!client || !validApproval(params, client.redirect_uris, resource)) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const code = randomToken();
  if (!params.deny) {
    await saveAuthCode(code, {
      clientId: params.client_id,
      userId: session.user.id,
      resource,
      redirectUri: params.redirect_uri,
      codeChallenge: params.code_challenge,
      codeChallengeMethod: "S256",
    });
  }
  return Response.json(
    { redirect_to: callbackUrl(params, params.deny ? { error: "access_denied" } : { code }) },
    { headers: { "Cache-Control": "no-store" } },
  );
});
