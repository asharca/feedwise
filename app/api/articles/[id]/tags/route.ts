import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { addTagToArticle, getArticleById } from "@/lib/db/queries/articles";

const AddTagSchema = z.object({
  name: z.string().min(1).max(100),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Ownership check
  const article = await getArticleById(session.user.id, id);
  if (!article) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const { name } = AddTagSchema.parse(body);
    const tag = await addTagToArticle(session.user.id, id, name);
    return NextResponse.json({ success: true, data: tag });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to add tag" },
      { status: 500 }
    );
  }
}
