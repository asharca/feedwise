import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getArticleById, removeTagFromArticle } from "@/lib/db/queries/articles";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; tagId: string }> },
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id, tagId } = await params;

  // Article ownership check (also confirms the subscription join)
  const article = await getArticleById(session.user.id, id);
  if (!article) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const ok = await removeTagFromArticle(session.user.id, id, tagId);
  if (!ok) {
    return NextResponse.json({ success: false, error: "Tag not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
