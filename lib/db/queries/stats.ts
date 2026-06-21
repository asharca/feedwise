import { and, eq, gte, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { articleTags, articles, feeds, subscriptions, tags, userArticles } from "@/lib/db/schema";

export interface DashboardStats {
  subscriptions: number;
  failingFeeds: number;
  unread: number;
  newToday: number;
  readThisWeek: number;
  tags: number;
}

/**
 * One round-trip Promise.all of cheap COUNT(*) queries. Each is filtered
 * down by joining through subscriptions so the user only sees stats over
 * feeds they are actually subscribed to.
 */
export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [subsRow, failingRow, unreadRow, newRow, readRow, tagsRow] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId)),

    db
      .select({ n: sql<number>`count(distinct ${feeds.id})::int` })
      .from(feeds)
      .innerJoin(subscriptions, eq(subscriptions.feedId, feeds.id))
      .where(
        and(
          eq(subscriptions.userId, userId),
          or(isNotNull(feeds.lastFetchError), sql`${feeds.consecutiveFailures} > 0`),
        ),
      ),

    db
      .select({ n: sql<number>`count(*)::int` })
      .from(articles)
      .innerJoin(
        subscriptions,
        and(eq(subscriptions.feedId, articles.feedId), eq(subscriptions.userId, userId)),
      )
      .leftJoin(
        userArticles,
        and(eq(userArticles.articleId, articles.id), eq(userArticles.userId, userId)),
      )
      .where(or(isNull(userArticles.isRead), eq(userArticles.isRead, false))),

    db
      .select({ n: sql<number>`count(*)::int` })
      .from(articles)
      .innerJoin(
        subscriptions,
        and(eq(subscriptions.feedId, articles.feedId), eq(subscriptions.userId, userId)),
      )
      .where(gte(articles.createdAt, since24h)),

    db
      .select({ n: sql<number>`count(*)::int` })
      .from(userArticles)
      .where(
        and(
          eq(userArticles.userId, userId),
          eq(userArticles.isRead, true),
          gte(userArticles.readAt, since7d),
        ),
      ),

    db.select({ n: sql<number>`count(*)::int` }).from(tags).where(eq(tags.userId, userId)),
  ]);

  return {
    subscriptions: subsRow[0]?.n ?? 0,
    failingFeeds: failingRow[0]?.n ?? 0,
    unread: unreadRow[0]?.n ?? 0,
    newToday: newRow[0]?.n ?? 0,
    readThisWeek: readRow[0]?.n ?? 0,
    tags: tagsRow[0]?.n ?? 0,
  };
}

export interface DashboardTimeline {
  days: string[]; // ISO date "YYYY-MM-DD"
  newPerDay: number[];
  readsPerDay: number[];
  tagActivity: Array<{
    tag: { id: string; name: string };
    counts: number[];
    total: number;
    // Total for the equal-length window immediately before [from, to]. Used to
    // derive momentum (rising/falling) for the trending board.
    prevTotal: number;
  }>;
}

const MAX_TAGS_IN_HEATMAP = 10;
const MAX_DAYS = 365;

/**
 * Build the per-day time series used by the dashboard charts. Returns a fixed
 * `days` array (newest last) with zeros where there is no data, so the client
 * can render bar/heatmap cells without any padding logic.
 *
 * Accepts an arbitrary [from, to] range (both inclusive, normalised to UTC
 * midnight). Capped at MAX_DAYS to keep the per-tag matrix readable.
 */
export async function getDashboardTimeline(
  userId: string,
  from: Date,
  to: Date,
): Promise<DashboardTimeline> {
  // Normalise to UTC midnight, clamp ordering, cap window length
  const startDate = new Date(from);
  startDate.setUTCHours(0, 0, 0, 0);
  const endDate = new Date(to);
  endDate.setUTCHours(0, 0, 0, 0);
  if (endDate < startDate) {
    endDate.setTime(startDate.getTime());
  }
  const rawDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  const safeDays = Math.max(1, Math.min(MAX_DAYS, rawDays));
  if (safeDays !== rawDays) {
    startDate.setTime(endDate.getTime());
    startDate.setUTCDate(startDate.getUTCDate() - (safeDays - 1));
  }
  // Half-open upper bound for SQL `< endExclusive`
  const endExclusive = new Date(endDate);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  // Previous equal-length window [prevStart, startDate) for per-tag momentum.
  const prevStart = new Date(startDate);
  prevStart.setUTCDate(prevStart.getUTCDate() - safeDays);

  const dayList: string[] = [];
  for (let i = 0; i < safeDays; i++) {
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + i);
    dayList.push(d.toISOString().slice(0, 10));
  }

  const dayIndex = new Map(dayList.map((d, i) => [d, i]));
  function makeSeries() {
    return new Array<number>(safeDays).fill(0);
  }

  // Articles added per day
  const newRowsP = db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${articles.createdAt}) AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      n: sql<number>`count(*)::int`,
    })
    .from(articles)
    .innerJoin(
      subscriptions,
      and(eq(subscriptions.feedId, articles.feedId), eq(subscriptions.userId, userId)),
    )
    .where(and(gte(articles.createdAt, startDate), sql`${articles.createdAt} < ${endExclusive}`))
    .groupBy(sql`date_trunc('day', ${articles.createdAt})`);

  // Reads per day
  const readRowsP = db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${userArticles.readAt}) AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      n: sql<number>`count(*)::int`,
    })
    .from(userArticles)
    .where(
      and(
        eq(userArticles.userId, userId),
        eq(userArticles.isRead, true),
        gte(userArticles.readAt, startDate),
        sql`${userArticles.readAt} < ${endExclusive}`,
      ),
    )
    .groupBy(sql`date_trunc('day', ${userArticles.readAt})`);

  // Tag-by-day counts (articles created that day with that tag)
  const tagRowsP = db
    .select({
      tagId: tags.id,
      tagName: tags.name,
      day: sql<string>`to_char(date_trunc('day', ${articles.createdAt}) AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      n: sql<number>`count(*)::int`,
    })
    .from(articleTags)
    .innerJoin(tags, eq(articleTags.tagId, tags.id))
    .innerJoin(articles, eq(articles.id, articleTags.articleId))
    .innerJoin(
      subscriptions,
      and(eq(subscriptions.feedId, articles.feedId), eq(subscriptions.userId, userId)),
    )
    .where(and(eq(tags.userId, userId), gte(articles.createdAt, startDate)))
    .groupBy(tags.id, tags.name, sql`date_trunc('day', ${articles.createdAt})`);

  // Per-tag totals for the previous equal-length window (momentum baseline).
  const prevTagRowsP = db
    .select({
      tagId: tags.id,
      n: sql<number>`count(*)::int`,
    })
    .from(articleTags)
    .innerJoin(tags, eq(articleTags.tagId, tags.id))
    .innerJoin(articles, eq(articles.id, articleTags.articleId))
    .innerJoin(
      subscriptions,
      and(eq(subscriptions.feedId, articles.feedId), eq(subscriptions.userId, userId)),
    )
    .where(
      and(
        eq(tags.userId, userId),
        gte(articles.createdAt, prevStart),
        sql`${articles.createdAt} < ${startDate}`,
      ),
    )
    .groupBy(tags.id);

  const [newRows, readRows, tagRows, prevTagRows] = await Promise.all([
    newRowsP,
    readRowsP,
    tagRowsP,
    prevTagRowsP,
  ]);

  const prevByTag = new Map<string, number>();
  for (const r of prevTagRows) prevByTag.set(r.tagId, r.n);

  const newPerDay = makeSeries();
  for (const r of newRows) {
    const i = dayIndex.get(r.day);
    if (i !== undefined) newPerDay[i] = r.n;
  }

  const readsPerDay = makeSeries();
  for (const r of readRows) {
    const i = dayIndex.get(r.day);
    if (i !== undefined) readsPerDay[i] = r.n;
  }

  // Aggregate per-tag totals + per-day series, then keep the top-N tags.
  const byTag = new Map<string, { id: string; name: string; total: number; counts: number[] }>();
  for (const r of tagRows) {
    let agg = byTag.get(r.tagId);
    if (!agg) {
      agg = { id: r.tagId, name: r.tagName, total: 0, counts: makeSeries() };
      byTag.set(r.tagId, agg);
    }
    const i = dayIndex.get(r.day);
    if (i !== undefined) {
      agg.counts[i] = r.n;
      agg.total += r.n;
    }
  }
  const tagActivity = Array.from(byTag.values())
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, MAX_TAGS_IN_HEATMAP)
    .map((t) => ({
      tag: { id: t.id, name: t.name },
      counts: t.counts,
      total: t.total,
      prevTotal: prevByTag.get(t.id) ?? 0,
    }));

  return { days: dayList, newPerDay, readsPerDay, tagActivity };
}
