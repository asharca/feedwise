import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/with-auth";
import { getSubscriptions } from "@/lib/db/queries/feeds";

export const GET = withAuth(async (_req, session) => {
  const subs = await getSubscriptions(session.user.id);

  const outlines = subs
    .map((s) => {
      const title = escapeXml(s.title ?? s.feedTitle ?? s.url);
      const xmlUrl = escapeXml(s.url);
      const htmlUrl = escapeXml(s.siteUrl ?? "");
      return `    <outline type="rss" text="${title}" title="${title}" xmlUrl="${xmlUrl}" htmlUrl="${htmlUrl}" />`;
    })
    .join("\n");

  const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Feedwise Subscriptions</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${outlines}
  </body>
</opml>`;

  return new NextResponse(opml, {
    headers: {
      "Content-Type": "application/xml",
      "Content-Disposition": 'attachment; filename="feedwise-subscriptions.opml"',
    },
  });
});

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
