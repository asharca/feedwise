import type { ClientFeed, ClientItem } from "@/lib/db/queries/client-api";

export function feverResponse(
  authenticated: boolean,
  refreshed: number,
  fields: Record<string, unknown> = {},
) {
  return {
    ...fields,
    api_version: 3,
    auth: authenticated ? 1 : 0,
    last_refreshed_on_time: refreshed,
  };
}

export function feverFeeds(feeds: ClientFeed[]) {
  return feeds.map((f) => ({
    id: f.seq,
    favicon_id: 0,
    title: f.title,
    url: f.url,
    site_url: f.siteUrl ?? f.url,
    is_spark: 0,
    last_updated_on_time: f.updated ? Math.floor(f.updated.getTime() / 1000) : 0,
  }));
}

export function feedGroups(feeds: ClientFeed[]) {
  const groups = new Map<number, number[]>();
  for (const feed of feeds) {
    if (feed.groupSeq === null) continue;
    const ids = groups.get(feed.groupSeq);
    if (ids) ids.push(feed.seq);
    else groups.set(feed.groupSeq, [feed.seq]);
  }
  return Array.from(groups, ([group_id, ids]) => ({ group_id, feed_ids: ids.join(",") }));
}

export function feverItem(item: ClientItem) {
  return {
    id: item.seq,
    feed_id: item.feedSeq,
    title: item.title,
    author: item.author,
    html: item.html,
    url: item.url,
    is_saved: Number(item.isStarred),
    is_read: Number(item.isRead),
    created_on_time: item.published,
  };
}
