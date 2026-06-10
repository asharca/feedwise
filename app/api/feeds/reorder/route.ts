import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { reorderSubscriptions } from "@/lib/db/queries/feeds";

const ReorderSchema = z.object({
  subscriptionIds: z.array(z.string().uuid()).min(1),
});

export const PATCH = withAuth(async (req, session) => {
  const body = await req.json();
  const { subscriptionIds } = ReorderSchema.parse(body);
  await reorderSubscriptions(session.user.id, subscriptionIds);
  return NextResponse.json({ success: true });
});
