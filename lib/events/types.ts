// lib/events/types.ts

export type FeedwiseEvent =
  | { type: "articles.new"; feedId: string; count: number }
  | { type: "feed.fetched"; feedId: string }
  | { type: "feed.error"; feedId: string; errorCode: string; message: string }
  | { type: "feed.deleted"; subscriptionId: string; feedId: string };
