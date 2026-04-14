import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const REGISTER_CODE = "ashark";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
  code: z.string(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = registerSchema.parse(body);

    // Verify registration code
    if (parsed.code !== REGISTER_CODE) {
      return NextResponse.json({ success: false, error: "Invalid registration code" }, { status: 400 });
    }

    // Check if email already exists
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.email));

    if (existing.length > 0) {
      return NextResponse.json({ success: false, error: "Email already registered" }, { status: 400 });
    }

    // Use better-auth to create user
    const auth = getAuth();

    // Create user through better-auth
    const result = await auth.api.signUpEmail({
      body: {
        email: parsed.email,
        password: parsed.password,
        name: parsed.name || parsed.email.split("@")[0],
      },
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.issues }, { status: 400 });
    }
    console.error("[register] Error:", err);
    return NextResponse.json({ success: false, error: "Registration failed" }, { status: 500 });
  }
}
