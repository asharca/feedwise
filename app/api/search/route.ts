import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { searchArticles, searchFeedsByName, searchTagsByName } from "@/lib/db/queries/search";

const QuerySchema = z.object({
  q: z
    .string()
    .min(1, "q is required")
    .max(500, "q too long")
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, "q is required"),
  feedId: z.string().uuid().optional(),
  folderId: z.string().uuid().optional(),
  tag: z.string().uuid().optional(),
  unread: z.enum(["true", "false"]).optional(),
  starred: z.enum(["true", "false"]).optional(),
  since: z
    .string()
    .datetime()
    .optional()
    .transform((s) => (s ? new Date(s) : undefined)),
  limit: z
    .string()
    .optional()
    .transform((s) => (s ? Math.min(parseInt(s, 10) || 5, 20) : 5)),
});

export const GET = withAuth(async (req, session) => {
  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const parsed = QuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 400 });
  }

  const { q, feedId, folderId, tag, unread, starred, since, limit } = parsed.data;
  const opts = {
    q,
    feedId,
    folderId,
    tagId: tag,
    unreadOnly: unread === "true",
    starredOnly: starred === "true",
    since,
    limit,
  };

  const userId = session.user.id;
  const [articlesResult, feedsResult, tagsResult] = await Promise.allSettled([
    searchArticles(userId, opts),
    searchFeedsByName(userId, q, limit),
    searchTagsByName(userId, q, limit),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      query: q,
      articles: articlesResult.status === "fulfilled" ? articlesResult.value : [],
      feeds: feedsResult.status === "fulfilled" ? feedsResult.value : [],
      tags: tagsResult.status === "fulfilled" ? tagsResult.value : [],
    },
  });
});
