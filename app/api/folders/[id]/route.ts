import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { updateFolder, deleteFolder } from "@/lib/db/queries/feeds";

const PatchSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    parentId: z.string().uuid().nullable().optional(),
  })
  .refine((d) => d.name !== undefined || d.parentId !== undefined, {
    message: "Provide at least one field to update",
  });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const body = await req.json();
    const data = PatchSchema.parse(body);

    // Prevent a folder from becoming its own parent
    if (data.parentId === id) {
      return NextResponse.json(
        { success: false, error: "A folder cannot be its own parent" },
        { status: 400 },
      );
    }

    const folder = await updateFolder(session.user.id, id, data);
    if (!folder) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: folder });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    // Unique constraint violation on (userId, name)
    if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
      return NextResponse.json(
        { success: false, error: "A folder with that name already exists" },
        { status: 409 },
      );
    }
    return NextResponse.json({ success: false, error: "Failed to update folder" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const ok = await deleteFolder(session.user.id, id);
  if (!ok) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
