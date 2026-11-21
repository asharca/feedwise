import type { ClientFeed, ClientItem, ItemRef } from "@/lib/db/queries/client-api";
import { itemId, LABEL, READING_LIST, STATE } from "./protocol";

export function subscription(feed: ClientFeed) {
  return {
    id: `feed/${feed.id}`,
    title: feed.title,
    categories: feed.folder ? [{ id: LABEL + feed.folder, label: feed.folder }] : [],
    url: feed.url,
    htmlUrl: feed.siteUrl ?? feed.url,
    iconUrl: feed.iconUrl ?? "",
  };
}

export function readerRef(row: ItemRef) {
  return {
    id: String(row.seq),
    timestampUsec: row.crawlUsec,
    directStreamIds: [`feed/${row.feedId}`],
  };
}

export function readerItem(row: ClientItem) {
  const categories = [READING_LIST];
  if (row.isRead) categories.push(STATE + "read");
  if (row.isStarred) categories.push(STATE + "starred");
  for (const name of new Set([row.folder, ...row.tags])) if (name) categories.push(LABEL + name);
  const link = row.url ? [{ href: row.url, type: "text/html" }] : [];
  return {
    id: itemId(row.seq),
    crawlTimeMsec: String(Math.floor(Number(row.crawlUsec) / 1000)),
    timestampUsec: row.crawlUsec,
    published: row.published,
    updated: row.published,
    title: row.title,
    author: row.author,
    categories,
    canonical: link,
    alternate: link,
    summary: { direction: "ltr", content: row.html },
    origin: { streamId: `feed/${row.feedId}`, title: row.feedTitle, htmlUrl: row.siteUrl },
  };
}
