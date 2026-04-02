import { NextResponse } from "next/server";
import { consumeAuthCode } from "@/lib/oauth/store";
import { verifyPKCE } from "@/lib/oauth/pkce";
import { createApiToken } from "@/lib/db/queries/api-tokens";

export async function POST(req: Request) {
  const body = await req.formData();
  const grantType = body.get("grant_type") as string;
  const clientId = body.get("client_id") as string;

  if (grantType !== "authorization_code") {
    return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
  }

  const code = body.get("code") as string;
  const codeVerifier = body.get("code_verifier") as string;

  const authCode = await consumeAuthCode(code);
  if (!authCode || authCode.clientId !== clientId) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  const pkceValid = await verifyPKCE(
    codeVerifier,
    authCode.codeChallenge,
    authCode.codeChallengeMethod
  );
  if (!pkceValid) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  const { token } = await createApiToken(
    authCode.userId,
    `OAuth: ${clientId}`
  );

  return NextResponse.json({
    access_token: token,
    token_type: "bearer",
    expires_in: 86400 * 365,
  });
}
