import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";

const updateSchema = z.object({
  name: z.string().max(255).optional(),
  email: z.string().email().optional(),
});

export const GET = withAuth(async (_req, session) => {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ success: true, data: user });
});

export const PUT = withAuth(async (req, session) => {
  const body = await req.json();
  const parsed = updateSchema.parse(body);

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (parsed.name !== undefined) {
    updateData.name = parsed.name;
  }
  if (parsed.email !== undefined) {
    // Check if email is already taken
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.email));

    if (existing.length > 0 && existing[0].id !== session.user.id) {
      return NextResponse.json(
        { success: false, error: "Email already in use" },
        { status: 400 },
      );
    }
    updateData.email = parsed.email;
  }

  const [updated] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, session.user.id))
    .returning();

  return NextResponse.json({ success: true, data: updated });
});
