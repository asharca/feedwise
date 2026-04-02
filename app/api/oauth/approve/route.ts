import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getClient, saveClient, saveAuthCode } from "@/lib/oauth/store";

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const { client_id, redirect_uri, state, code_challenge, code_challenge_method } = body;

  let client = await getClient(client_id);
  if (!client) {
    // Auto-register unknown clients (e.g. Claude.ai skips /register)
    client = {
      client_id,
      client_secret: "",
      client_name: client_id,
      redirect_uris: [redirect_uri],
    };
    await saveClient(client);
  }

  // Generate authorization code
  const code = crypto.randomUUID();
  await saveAuthCode({
    code,
    clientId: client_id,
    userId: session.user.id,
    redirectUri: redirect_uri,
    codeChallenge: code_challenge,
    codeChallengeMethod: code_challenge_method ?? "S256",
  });

  const url = new URL(redirect_uri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);

  return NextResponse.json({ redirect_to: url.toString() });
}
