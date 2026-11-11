import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/with-auth";
import { computeHotTrending, getHotBoards } from "@/lib/hot/boards";

export const GET = withAuth(async () => {
  const boards = await getHotBoards();
  return NextResponse.json({ success: true, data: computeHotTrending(boards) });
});
