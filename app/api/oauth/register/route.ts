import { NextResponse } from "next/server";
import { saveClient } from "@/lib/oauth/store";

export async function POST(req: Request) {
  const body = await req.json();

  const clientId = crypto.randomUUID();
  const clientSecret = crypto.randomUUID();

  const client = {
    client_id: clientId,
    client_secret: clientSecret,
    client_name: body.client_name ?? "MCP Client",
    redirect_uris: body.redirect_uris ?? [],
  };

  await saveClient(client);

  return NextResponse.json(client, { status: 201 });
}
