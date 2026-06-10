import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { applyFolderProposal } from "@/lib/db/queries/feeds";

const Schema = z.object({
  folders: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        feedIds: z.array(z.string().uuid()),
      }),
    )
    .max(20),
});

export const POST = withAuth(async (req, session) => {
  let parsed;
  try {
    const body = await req.json();
    parsed = Schema.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const result = await applyFolderProposal(session.user.id, parsed.folders);
  return NextResponse.json({ success: true, data: result });
});
