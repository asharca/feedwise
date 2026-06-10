import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { reorderFolders } from "@/lib/db/queries/feeds";

const ReorderSchema = z.object({
  folderIds: z.array(z.string().uuid()).min(1),
});

export const PATCH = withAuth(async (req, session) => {
  const body = await req.json();
  const { folderIds } = ReorderSchema.parse(body);
  await reorderFolders(session.user.id, folderIds);
  return NextResponse.json({ success: true });
});
