import { NextResponse } from "next/server";
import { consumeAuthCode } from "@/lib/oauth/store";
import { verifyPKCE } from "@/lib/oauth/pkce";
import { createApiToken } from "@/lib/db/queries/api-tokens";

async function parseBody(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return req.json();
  }
  const form = await req.formData();
  const result: Record<string, string> = {};
  form.forEach((value, key) => {
    result[key] = value as string;
  });
  return result;
}

export async function POST(req: Request) {
  const body = await parseBody(req);
  const grantType = body.grant_type;
  const clientId = body.client_id;

  if (grantType !== "authorization_code") {
    return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
  }

  const code = body.code;
  const codeVerifier = body.code_verifier;

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
