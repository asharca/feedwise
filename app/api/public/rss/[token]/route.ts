import { findPublicShare, sharedArticles } from "@/lib/db/queries/share-feeds";
import { rssUrl } from "@/lib/share/feed";
import { buildRss } from "@/lib/share/rss";

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const share = /^[a-zA-Z0-9_-]{43}$/.test(token) ? await findPublicShare(token) : null;
  if (!share) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const articles = await sharedArticles(share.userId, share.filter);
  return new Response(buildRss(share.name, rssUrl(req, share.token), articles), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
