import { NextResponse } from "next/server";
import { headers } from "next/headers";

export async function GET() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const base = `${proto}://${host}`;

  return NextResponse.json({
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
  });
}
