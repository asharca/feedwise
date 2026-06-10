import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";

type Session = Awaited<ReturnType<typeof requireSession>>;

export interface RouteContext {
  params: Promise<Record<string, string>>;
}

type AuthedHandler = (req: Request, session: Session, ctx: RouteContext) => Promise<Response>;

/**
 * Wrap an App Router route handler with the standard auth + error envelope:
 * 401 when unauthenticated, 400 on ZodError, 500 (generic message, detail
 * logged) on anything uncaught. Domain-specific error mapping stays inside
 * the handler.
 */
export function withAuth(handler: AuthedHandler) {
  return async (req: Request, ctx: RouteContext): Promise<Response> => {
    let session: Session;
    try {
      session = await requireSession();
    } catch {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      return await handler(req, session, ctx);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      }
      console.error(`[api] ${req.method} ${new URL(req.url).pathname}:`, error);
      return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
    }
  };
}
