import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { updateFolder, deleteFolder } from "@/lib/db/queries/feeds";

const PatchSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    parentId: z.string().uuid().nullable().optional(),
  })
  .refine((d) => d.name !== undefined || d.parentId !== undefined, {
    message: "Provide at least one field to update",
  });

export const PATCH = withAuth(async (req, session, ctx) => {
  const { id } = await ctx.params;
  const body = await req.json();
  const data = PatchSchema.parse(body);

  // Prevent a folder from becoming its own parent
  if (data.parentId === id) {
    return NextResponse.json(
      { success: false, error: "A folder cannot be its own parent" },
      { status: 400 },
    );
  }

  try {
    const folder = await updateFolder(session.user.id, id, data);
    if (!folder) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: folder });
  } catch (error) {
    // Unique constraint violation on (userId, name)
    if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
      return NextResponse.json(
        { success: false, error: "A folder with that name already exists" },
        { status: 409 },
      );
    }
    throw error;
  }
});

export const DELETE = withAuth(async (_req, session, ctx) => {
  const { id } = await ctx.params;
  const ok = await deleteFolder(session.user.id, id);
  if (!ok) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
});
