import { expect, it } from "vitest";
import { feedGroups, feverFeeds, feverItem, feverResponse } from "@/lib/client-api/fever/present";
import { readerItem, readerRef, subscription } from "@/lib/client-api/greader/present";
import type { ClientFeed, ClientItem } from "@/lib/db/queries/client-api";
import { LABEL, READING_LIST, STATE } from "@/lib/client-api/greader/protocol";

const feed: ClientFeed = {
  id: "uuid",
  seq: 41,
  title: "Feed",
  url: "https://example.org/rss",
  siteUrl: null,
  iconUrl: null,
  groupSeq: 7,
  folder: "News",
  updated: new Date(42000),
};
const item: ClientItem = {
  seq: 99,
  feedId: feed.id,
  feedSeq: feed.seq,
  feedTitle: feed.title,
  siteUrl: feed.url,
  published: 10,
  crawlUsec: "10000001",
  title: "Title",
  author: "You",
  html: "<p>hello</p>",
  url: "https://example.org/post",
  isStarred: true,
  isRead: false,
  tags: ["News", "Work"],
  folder: feed.folder,
};

it("returns Fever's integer flags, seq ids, and CSV group membership", () => {
  expect(feverResponse(false, 0)).toEqual({ api_version: 3, auth: 0, last_refreshed_on_time: 0 });
  expect(feverResponse(true, 42, { feeds: feverFeeds([feed]) })).toEqual({
    api_version: 3,
    auth: 1,
    last_refreshed_on_time: 42,
    feeds: [
      {
        id: 41,
        title: "Feed",
        favicon_id: 0,
        is_spark: 0,
        site_url: feed.url,
        url: feed.url,
        last_updated_on_time: 42,
      },
    ],
  });
  expect(feedGroups([feed, { ...feed, seq: 42 }, { ...feed, seq: 43, groupSeq: null }])).toEqual([
    { group_id: 7, feed_ids: "41,42" },
  ]);
  expect(feverItem(item)).toEqual({
    id: 99,
    feed_id: 41,
    title: item.title,
    author: item.author,
    html: item.html,
    url: item.url,
    is_saved: 1,
    is_read: 0,
    created_on_time: 10,
  });
});

it("maps Reader stream ids without exposing Fever ids or duplicating same-name labels", () => {
  expect(subscription(feed)).toMatchObject({
    id: "feed/uuid",
    categories: [{ id: LABEL + "News", label: "News" }],
  });
  expect(readerRef(item)).toEqual({
    id: "99",
    timestampUsec: item.crawlUsec,
    directStreamIds: ["feed/uuid"],
  });
  expect(readerItem(item)).toMatchObject({
    id: "tag:google.com,2005:reader/item/0000000000000063",
    crawlTimeMsec: "10000",
    categories: [READING_LIST, STATE + "starred", LABEL + "News", LABEL + "Work"],
    origin: { streamId: "feed/uuid" },
  });
});
