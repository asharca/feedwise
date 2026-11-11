import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { getHotBoards } from "@/lib/hot/boards";

const CategorySchema = z.enum(["all", "news", "tech", "community", "entertainment"]);

export const GET = withAuth(async (req) => {
  const category = CategorySchema.parse(new URL(req.url).searchParams.get("category") ?? "all");
  const boards = await getHotBoards(category);
  return NextResponse.json({ success: true, data: { boards } });
});
