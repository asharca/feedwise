import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { getFolders, createFolder } from "@/lib/db/queries/feeds";

const CreateFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().uuid().optional(),
});

export const GET = withAuth(async (_req, session) => {
  const data = await getFolders(session.user.id);
  return NextResponse.json({ success: true, data });
});

export const POST = withAuth(async (req, session) => {
  const body = await req.json();
  const { name, parentId } = CreateFolderSchema.parse(body);
  const folder = await createFolder(session.user.id, name, parentId);
  return NextResponse.json({ success: true, data: folder });
});
