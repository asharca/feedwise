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
  try {
    const body = await parseBody(req);
    const grantType = body.grant_type;
    const clientId = body.client_id;

    console.log("[token] request:", { grantType, clientId, hasCode: !!body.code, hasVerifier: !!body.code_verifier, hasRedirectUri: !!body.redirect_uri, hasResource: !!body.resource });

    if (grantType !== "authorization_code") {
      console.log("[token] rejected: unsupported_grant_type", grantType);
      return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
    }

    const code = body.code;
    const codeVerifier = body.code_verifier;

    const authCode = await consumeAuthCode(code);
    if (!authCode) {
      console.log("[token] rejected: auth code not found or expired");
      return NextResponse.json({ error: "invalid_grant", error_description: "code not found" }, { status: 400 });
    }
    if (authCode.clientId !== clientId) {
      console.log("[token] rejected: client_id mismatch", { expected: authCode.clientId, got: clientId });
      return NextResponse.json({ error: "invalid_grant", error_description: "client mismatch" }, { status: 400 });
    }

    const pkceValid = await verifyPKCE(
      codeVerifier,
      authCode.codeChallenge,
      authCode.codeChallengeMethod
    );
    if (!pkceValid) {
      console.log("[token] rejected: PKCE verification failed");
      return NextResponse.json({ error: "invalid_grant", error_description: "PKCE failed" }, { status: 400 });
    }

    const { token } = await createApiToken(
      authCode.userId,
      `OAuth: ${clientId}`
    );

    console.log("[token] success: token issued for user", authCode.userId);
    return NextResponse.json({
      access_token: token,
      token_type: "bearer",
      expires_in: 86400 * 365,
    });
  } catch (err) {
    console.error("[token] unhandled error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
