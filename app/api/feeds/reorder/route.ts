import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { reorderSubscriptions } from "@/lib/db/queries/feeds";

const ReorderSchema = z.object({
  subscriptionIds: z.array(z.string().uuid()).min(1),
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
    const { subscriptionIds } = ReorderSchema.parse(body);
    await reorderSubscriptions(session.user.id, subscriptionIds);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, error: "Failed to reorder feeds" },
      { status: 500 }
    );
  }
}
