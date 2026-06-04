import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { reorderFolders } from "@/lib/db/queries/feeds";

const ReorderSchema = z.object({
  folderIds: z.array(z.string().uuid()).min(1),
});

export async function PATCH(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { folderIds } = ReorderSchema.parse(body);
    await reorderFolders(session.user.id, folderIds);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, error: "Failed to reorder folders" },
      { status: 500 },
    );
  }
}
