import { getFeedSubscribers } from "@/lib/db/queries/feeds";
import { publishEvent } from "@/lib/events/publisher";
import type { FeedwiseEvent } from "@/lib/events/types";
import { enqueueFullText } from "@/lib/jobs/queues/fulltext";
import { applyRulesToNewArticles } from "@/lib/rules/apply";
import { classifyError, FeedError, humanMessage } from "./feed-error";
import { fetchFeed } from "./fetcher";
import { parseHtmlSource } from "./html-source";
import { parseFeed, type ParsedFeed } from "./parser";
import { loadFeed, saveFetch, saveFailure } from "./store";

export interface IngestDeps {
  load: typeof loadFeed;
  fetch: typeof fetchFeed;
  parse: typeof parseFeed;
  save: typeof saveFetch;
  saveFailure: typeof saveFailure;
  getSubscribers: typeof getFeedSubscribers;
  publish: typeof publishEvent;
  applyRules: typeof applyRulesToNewArticles;
  enqueueFullText: typeof enqueueFullText;
}

const defaults: IngestDeps = {
  load: loadFeed,
  fetch: fetchFeed,
  parse: parseFeed,
  save: saveFetch,
  saveFailure,
  getSubscribers: getFeedSubscribers,
  publish: publishEvent,
  applyRules: applyRulesToNewArticles,
  enqueueFullText,
};

export async function ingestFeed(
  feedId: string,
  deps: IngestDeps = defaults,
): Promise<{ articleCount: number }> {
  // Always use the current URL/config, never a stale queue payload.
  const feed = await deps.load(feedId);
  if (!feed) return { articleCount: 0 };
  let inserted: string[];
  try {
    const html = feed.sourceType === "html";
    const response = await deps.fetch(feed.url, {
      etag: feed.etag,
      lastModified: feed.lastModified,
      html,
    });
    let parsed: ParsedFeed | null = null;
    if (response.body !== null) {
      if (html && !feed.sourceConfig) throw new FeedError("parse", "HTML 源缺少选择器");
      parsed =
        html && feed.sourceConfig
          ? parseHtmlSource(response.body, response.url, feed.sourceConfig)
          : deps.parse(response.body, response.url);
    }
    inserted = await deps.save(feedId, feed.url, response, parsed);
  } catch (err) {
    const error = classifyError(err);
    await deps.saveFailure(feedId, feed.url, error);
    const message = humanMessage(error.code, error.httpStatus);
    const subscribers = await deps.getSubscribers(feedId);
    await Promise.all(
      subscribers.map((s) =>
        deps.publish(s.userId, { type: "feed.error", feedId, errorCode: error.code, message }),
      ),
    );
    throw error;
  }

  // Side effects run only after commit; a queue outage is not an upstream feed failure.
  const subscribers = await deps.getSubscribers(feedId);
  if (inserted.length) await deps.applyRules(feedId, inserted);
  const event: FeedwiseEvent = inserted.length
    ? { type: "articles.new", feedId, count: inserted.length }
    : { type: "feed.fetched", feedId };
  await Promise.all(subscribers.map((s) => deps.publish(s.userId, event)));
  if (subscribers.some((s) => s.fetchFullText)) {
    for (const id of inserted) await deps.enqueueFullText(id);
  }
  return { articleCount: inserted.length };
}
