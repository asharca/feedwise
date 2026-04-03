import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const CORS_PATHS = [
  "/api/mcp",
  "/token",
  "/api/oauth/register",
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-protected-resource",
];

function needsCors(pathname: string): boolean {
  return CORS_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "WWW-Authenticate",
};

export function middleware(request: NextRequest) {
  if (!needsCors(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: [
    "/api/mcp/:path*",
    "/token",
    "/api/oauth/:path*",
    "/.well-known/:path*",
  ],
};
