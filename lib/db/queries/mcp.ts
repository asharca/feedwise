import { eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { feeds, folders, subscriptions, users } from "@/lib/db/schema";
import type { ContentView } from "@/lib/db/schema-types";

export async function userIdForEmail(email: string) {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  return user?.id;
}

// A missing state row means unread, unstarred and visible. Keep the ownership
// join and hidden predicate identical for detail, search, mutations and related.
function visible(userId: string) {
  return sql`from articles a join feeds f on f.id = a.feed_id
    join subscriptions s on s.feed_id = f.id and s.user_id = ${userId}
    left join user_articles ua on ua.article_id = a.id and ua.user_id = s.user_id
    where ua.is_hidden is not true`;
}
const view = sql`coalesce(s.view, f.default_view, 'article')`;
const summary = sql`a.id, a.title, a.url, a.author, a.summary, a.published_at as "publishedAt",
  f.id as "feedId", coalesce(s.custom_title, f.title, f.url) as "feedTitle", ${view} as view,
  coalesce(ua.is_read,false) as "isRead", coalesce(ua.is_starred,false) as "isStarred"`;

export interface ListFilters {
  limit: number;
  unread_only?: boolean;
  starred_only?: boolean;
  feed_id?: string;
  view?: ContentView;
}
export async function listArticles(userId: string, filters: ListFilters) {
  const conditions: SQL[] = [];
  if (filters.unread_only) conditions.push(sql`and ua.is_read is not true`);
  if (filters.starred_only) conditions.push(sql`and ua.is_starred`);
  if (filters.feed_id) conditions.push(sql`and a.feed_id = ${filters.feed_id}`);
  if (filters.view) conditions.push(sql`and ${view} = ${filters.view}`);
  return (
    await db.execute(sql`select ${summary} ${visible(userId)} ${sql.join(conditions, sql` `)}
    order by a.sort_at desc, a.id desc limit ${filters.limit}`)
  ).rows;
}
export async function searchArticles(userId: string, query: string, limit: number) {
  const tsquery = sql`feedwise_search_query(${query})`;
  return (
    await db.execute(sql`select ${summary} ${visible(userId)} and a.search_tsv @@ ${tsquery}
    order by ts_rank_cd(a.search_tsv, ${tsquery}) desc, a.sort_at desc, a.id desc limit ${limit}`)
  ).rows;
}
export async function getArticle(userId: string, id: string) {
  const result = await db.execute<{
    id: string;
    summary: string | null;
    fullContentHtml: string | null;
    contentHtml: string | null;
    contentText: string | null;
  }>(sql`select ${summary}, a.full_content_html as "fullContentHtml", a.content_html as "contentHtml",
    a.content_text as "contentText" ${visible(userId)} and a.id = ${id}`);
  return result.rows[0] ?? null;
}
export async function markArticles(
  userId: string,
  ids: string[],
  read?: boolean,
  starred?: boolean,
) {
  const changes: SQL[] = [];
  if (read !== undefined)
    changes.push(sql`is_read = excluded.is_read`, sql`read_at = excluded.read_at`);
  if (starred !== undefined) changes.push(sql`is_starred = excluded.is_starred`);
  if (!changes.length) throw new Error("未指定要更改的状态");
  const result =
    await db.execute(sql`insert into user_articles(user_id, article_id, is_read, read_at, is_starred)
    select s.user_id, a.id, ${read ?? false}, ${read ? sql`now()` : sql`null::timestamp`}, ${starred ?? false}
    ${visible(userId)} and a.id in (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )})
    on conflict (user_id,article_id) do update set ${sql.join(changes, sql`, `)}
    where user_articles.is_hidden is not true returning article_id`);
  return { updated: result.rowCount ?? 0 };
}
export async function listFeeds(userId: string) {
  return (
    await db.execute(sql`select f.id, f.url, coalesce(s.custom_title,f.title,f.url) as title,
    d.name as folder, ${view} as view from subscriptions s join feeds f on f.id = s.feed_id
    left join folders d on d.id = s.folder_id and d.user_id = s.user_id
    where s.user_id = ${userId} order by s.position, title, f.id`)
  ).rows;
}
export async function subscribeFeed(userId: string, url: string, folder?: string) {
  return db.transaction(async (tx) => {
    const [feed] = await tx
      .insert(feeds)
      .values({ url })
      .onConflictDoUpdate({ target: feeds.url, set: { url } })
      .returning({ id: feeds.id });
    const folderId = folder
      ? (
          await tx
            .insert(folders)
            .values({ userId, name: folder })
            .onConflictDoUpdate({ target: [folders.userId, folders.name], set: { name: folder } })
            .returning({ id: folders.id })
        )[0].id
      : undefined;
    const [sub] = await tx
      .insert(subscriptions)
      .values({ userId, feedId: feed.id, folderId })
      .onConflictDoUpdate({
        target: [subscriptions.userId, subscriptions.feedId],
        set: { feedId: feed.id, folderId },
      })
      .returning({ id: subscriptions.id });
    return { feedId: feed.id, subscriptionId: sub.id };
  });
}
export async function relatedCoverage(userId: string, id: string) {
  return (
    await db.execute(sql`with seed as (
    select a.feed_id, a.sort_at, a.simhash ${visible(userId)} and a.id = ${id} and a.simhash is not null
  ) select a.id, a.title, a.url, a.published_at as "publishedAt", f.id as "feedId",
    coalesce(s.custom_title, f.title, f.url) as "feedTitle", f.icon_url as "feedIconUrl"
    ${visible(userId)} and a.feed_id <> (select feed_id from seed)
    and a.sort_at between (select sort_at from seed) - interval '3 days' and (select sort_at from seed) + interval '3 days'
    and bit_count((a.simhash # (select simhash from seed))::bit(64)) <= 3
    order by bit_count((a.simhash # (select simhash from seed))::bit(64)), a.sort_at desc, a.id desc limit 10`)
  ).rows;
}
