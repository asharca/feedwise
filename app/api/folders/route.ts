import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { getFolders, createFolder } from "@/lib/db/queries/feeds";

const CreateFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().uuid().optional(),
});

export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const data = await getFolders(session.user.id);
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const { name, parentId } = CreateFolderSchema.parse(body);
    const folder = await createFolder(session.user.id, name, parentId);
    return NextResponse.json({ success: true, data: folder });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
