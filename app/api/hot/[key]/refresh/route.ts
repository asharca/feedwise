import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/with-auth";
import { getHotSource } from "@/lib/hot/sources";
import { enqueueHotFetch } from "@/lib/jobs/queue";

export const POST = withAuth(async (_req, _session, ctx) => {
  const { key } = await ctx.params;
  if (!getHotSource(key)) {
    return NextResponse.json({ success: false, error: "未知热榜源" }, { status: 404 });
  }
  await enqueueHotFetch(key);
  return NextResponse.json({ success: true, data: { queued: true } });
});
