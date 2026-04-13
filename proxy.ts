import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const CORS_PATHS = [
  "/api/mcp",
  "/token",
  "/api/oauth/register",
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-protected-resource",
  "/api/webview",
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

// For /api/webview, we need to allow null origin (sandboxed iframe)
function getCorsHeaders(pathname: string): Record<string, string> {
  if (pathname.startsWith("/api/webview")) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Expose-Headers": "",
    };
  }
  return CORS_HEADERS;
}

export function proxy(request: NextRequest) {
  if (!needsCors(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  const headers = getCorsHeaders(request.nextUrl.pathname);
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(headers)) {
    if (value) response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: [
    "/api/mcp/:path*",
    "/token",
    "/api/oauth/:path*",
    "/.well-known/:path*",
    "/api/webview/:path*",
  ],
};
