import { and, eq, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  apiCredentials,
  clientTokens,
  folders,
  tags,
  subscriptions,
  feeds,
  users,
} from "@/lib/db/schema";
import type { Stream } from "@/lib/client-api/greader/protocol";

export async function accessConfigured(userId: string) {
  return !!(
    await db
      .select({ id: apiCredentials.userId })
      .from(apiCredentials)
      .where(eq(apiCredentials.userId, userId))
  )[0];
}

export async function replaceAccess(
  userId: string,
  values: { passwordHash: string; feverKey: string } | null,
) {
  await db.transaction(async (tx) => {
    if (values) {
      await tx
        .insert(apiCredentials)
        .values({ userId, ...values })
        .onConflictDoUpdate({
          target: apiCredentials.userId,
          set: { ...values, updatedAt: new Date() },
        });
    } else {
      await tx.delete(apiCredentials).where(eq(apiCredentials.userId, userId));
    }
    await tx.delete(clientTokens).where(eq(clientTokens.userId, userId));
  });
}

export async function loginCredential(email: string) {
  return (
    await db
      .select({ userId: users.id, hash: apiCredentials.passwordHash })
      .from(users)
      .innerJoin(apiCredentials, eq(apiCredentials.userId, users.id))
      .where(eq(users.email, email))
  )[0];
}

export async function issueToken(
  userId: string,
  verifiedHash: string,
  hash: string,
  client: string | null,
) {
  return db.transaction(async (tx) => {
    // Verification (scrypt) happened outside the transaction. Lock and recheck
    // this exact credential so concurrent rotation cannot resurrect a token.
    const [credential] = await tx
      .select({ id: apiCredentials.userId })
      .from(apiCredentials)
      .where(and(eq(apiCredentials.userId, userId), eq(apiCredentials.passwordHash, verifiedHash)))
      .for("share");
    if (!credential) return false;
    await tx
      .insert(clientTokens)
      .values({ userId, tokenHash: hash, client, lastUsedAt: new Date() });
    return true;
  });
}

export async function readerIdentity(hash: string) {
  const [identity] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      credentialHash: apiCredentials.passwordHash,
      lastUsedAt: clientTokens.lastUsedAt,
    })
    .from(clientTokens)
    .innerJoin(users, eq(users.id, clientTokens.userId))
    .innerJoin(apiCredentials, eq(apiCredentials.userId, users.id))
    .where(eq(clientTokens.tokenHash, hash));
  const threshold = new Date(Date.now() - 5 * 60_000);
  if (identity && (!identity.lastUsedAt || identity.lastUsedAt < threshold)) {
    await db
      .update(clientTokens)
      .set({ lastUsedAt: new Date() })
      .where(
        and(
          eq(clientTokens.tokenHash, hash),
          or(isNull(clientTokens.lastUsedAt), lt(clientTokens.lastUsedAt, threshold)),
        ),
      );
  }
  return identity;
}

export async function feverUser(key: string) {
  return (
    await db
      .select({ id: apiCredentials.userId })
      .from(apiCredentials)
      .where(eq(apiCredentials.feverKey, key))
  )[0]?.id;
}

export function clientFolders(userId: string) {
  return db
    .select({ seq: folders.seq, name: folders.name })
    .from(folders)
    .where(eq(folders.userId, userId))
    .orderBy(folders.position, folders.seq);
}

export function clientTags(userId: string) {
  return db
    .select({ name: tags.name })
    .from(tags)
    .where(eq(tags.userId, userId))
    .orderBy(tags.name);
}

export async function clientFeeds(userId: string): Promise<ClientFeed[]> {
  return db
    .select({
      id: feeds.id,
      seq: feeds.seq,
      url: feeds.url,
      siteUrl: feeds.siteUrl,
      iconUrl: feeds.iconUrl,
      title: sql<string>`coalesce(${subscriptions.customTitle}, ${feeds.title}, ${feeds.url})`,
      updated: feeds.lastFetchedAt,
      groupSeq: folders.seq,
      folder: folders.name,
    })
    .from(subscriptions)
    .innerJoin(feeds, eq(feeds.id, subscriptions.feedId))
    .leftJoin(
      folders,
      and(eq(folders.id, subscriptions.folderId), eq(folders.userId, subscriptions.userId)),
    )
    .where(eq(subscriptions.userId, userId))
    .orderBy(subscriptions.position, feeds.seq);
}

export interface ClientFeed {
  id: string;
  seq: number;
  url: string;
  siteUrl: string | null;
  iconUrl: string | null;
  title: string;
  updated: Date | null;
  groupSeq: number | null;
  folder: string | null;
}

export async function lastRefresh(userId: string) {
  const [row] = await db
    .select({
      last: sql<number>`coalesce(floor(extract(epoch from max(${feeds.lastFetchedAt}))), 0)::float8`,
    })
    .from(subscriptions)
    .innerJoin(feeds, eq(feeds.id, subscriptions.feedId))
    .where(eq(subscriptions.userId, userId));
  return row.last;
}

// All article reads AND writes start from this owner/visibility scope. A missing
// state row means unread, unstarred, visible (not an inner join).
export function articleSource(userId: string) {
  return sql`from subscriptions s join feeds f on f.id = s.feed_id join articles a on a.feed_id = f.id
    left join folders g on g.id = s.folder_id and g.user_id = s.user_id
    left join user_articles u on u.article_id = a.id and u.user_id = s.user_id
    where s.user_id = ${userId} and u.is_hidden is not true`;
}

const articleTagNames = sql`array(select t.name::text from article_tags atg join tags t on t.id = atg.tag_id
  where atg.article_id = a.id and t.user_id = s.user_id order by t.name)`;

function matchesStream(stream: Stream): SQL {
  switch (stream.kind) {
    case "reading-list":
      return sql`true`;
    case "read":
      return sql`u.is_read is true`;
    case "unread":
      return sql`u.is_read is not true`;
    case "starred":
      return sql`u.is_starred is true`;
    case "feed":
      return sql`(f.id::text = ${stream.value} or f.url = ${stream.value})`;
    case "label":
      return sql`(coalesce(g.name = ${stream.value}, false) or ${stream.value} = any(${articleTagNames}))`;
  }
}

export interface ItemFilter {
  streams?: Stream[];
  exclude?: Stream[];
  ids?: number[];
  feedSeq?: number;
  groupSeq?: number;
  after?: number;
  before?: number;
  minTime?: number; // Reader crawl time in seconds
  maxTime?: number;
  maxCrawlUsec?: number;
  maxPublished?: number; // Fever created_on_time in seconds
}

function selection(userId: string, filter: ItemFilter = {}) {
  const clauses: SQL[] = [articleSource(userId)];
  const add = (predicate: SQL) => clauses.push(sql`and (${predicate})`);
  if (filter.streams?.length) add(sql.join(filter.streams.map(matchesStream), sql` or `));
  for (const excluded of filter.exclude ?? []) add(sql`not (${matchesStream(excluded)})`);
  if (filter.ids)
    add(
      filter.ids.length
        ? sql`a.seq in (${sql.join(
            filter.ids.map((id) => sql`${id}`),
            sql`, `,
          )})`
        : sql`false`,
    );
  if (filter.feedSeq !== undefined) add(sql`f.seq = ${filter.feedSeq}`);
  if (filter.groupSeq !== undefined) add(sql`g.seq = ${filter.groupSeq}`);
  if (filter.after !== undefined) add(sql`a.seq > ${filter.after}`);
  if (filter.before !== undefined) add(sql`a.seq < ${filter.before}`);
  if (filter.minTime !== undefined) add(sql`extract(epoch from a.created_at) >= ${filter.minTime}`);
  if (filter.maxTime !== undefined)
    add(sql`floor(extract(epoch from a.created_at)) <= ${filter.maxTime}`);
  if (filter.maxCrawlUsec !== undefined)
    add(sql`extract(epoch from a.created_at) * 1000000 <= ${filter.maxCrawlUsec}`);
  if (filter.maxPublished !== undefined)
    add(sql`floor(extract(epoch from a.sort_at)) <= ${filter.maxPublished}`);
  return sql.join(clauses, sql` `);
}

export type ItemRef = { seq: number; feedId: string; crawlUsec: string };
export type ClientItem = ItemRef & {
  feedSeq: number;
  feedTitle: string;
  siteUrl: string;
  published: number;
  title: string;
  url: string;
  author: string;
  html: string;
  isRead: boolean;
  isStarred: boolean;
  folder: string | null;
  tags: string[];
};

const refColumns = sql`a.seq::float8 as seq, f.id as "feedId", (extract(epoch from a.created_at) * 1000000)::bigint::text as "crawlUsec"`;
const page = (oldest: boolean, limit: number) =>
  sql`order by a.seq ${oldest ? sql`asc` : sql`desc`} limit ${limit}`;

export async function itemRefs(userId: string, filter: ItemFilter, oldest: boolean, limit: number) {
  return (
    await db.execute<ItemRef>(
      sql`select ${refColumns} ${selection(userId, filter)} ${page(oldest, limit)}`,
    )
  ).rows;
}

export async function clientItems(
  userId: string,
  filter: ItemFilter,
  oldest: boolean,
  limit: number,
) {
  return (
    await db.execute<ClientItem>(sql`select ${refColumns}, f.seq as "feedSeq", coalesce(s.custom_title, f.title, f.url) as "feedTitle",
    coalesce(f.site_url, f.url) as "siteUrl", floor(extract(epoch from a.sort_at))::float8 as published,
    coalesce(a.title, '') as title, coalesce(a.url, '') as url, coalesce(a.author, '') as author,
    coalesce(a.content_html, a.summary, a.content_text, '') as html, u.is_read is true as "isRead", u.is_starred is true as "isStarred",
    g.name as folder, ${articleTagNames} as tags ${selection(userId, filter)} ${page(oldest, limit)}`)
  ).rows;
}

export async function itemCount(userId: string) {
  return (
    await db.execute<{ count: number }>(sql`select count(*)::float8 as count ${selection(userId)}`)
  ).rows[0].count;
}

export async function stateIds(userId: string, kind: "unread" | "starred") {
  return (
    await db.execute<{
      ids: string;
    }>(sql`select coalesce(string_agg(a.seq::text, ',' order by a.seq), '') as ids
    ${selection(userId, { streams: [{ kind }] })}`)
  ).rows[0].ids;
}

export async function unreadCounts(userId: string) {
  return (
    await db.execute<{ id: string; count: number; newestItemTimestampUsec: string }>(sql`
    select id, count(*)::float8 as count, (extract(epoch from max(created_at)) * 1000000)::bigint::text as "newestItemTimestampUsec"
    from (select a.created_at, unnest(array['user/-/state/com.google/reading-list', 'feed/' || f.id,
        case when u.is_starred then 'user/-/state/com.google/starred' end]
        || array(select distinct 'user/-/label/' || label from unnest(array[g.name::text] || ${articleTagNames}) label where label is not null)) as id
      ${selection(userId, { streams: [{ kind: "unread" }] })}) entries where id is not null group by id`)
  ).rows;
}

export type ItemChange =
  | { kind: "read" | "starred"; enabled: boolean }
  | { kind: "label"; name: string; enabled: boolean };

export async function changeItems(userId: string, filter: ItemFilter, changes: ItemChange[]) {
  const scope = selection(userId, filter);
  await db.transaction(async (tx) => {
    for (const change of changes) {
      if (change.kind === "read") {
        await tx.execute(sql`insert into user_articles (user_id, article_id, is_read, read_at)
          select s.user_id, a.id, ${change.enabled}::boolean, ${change.enabled ? sql`now()` : sql`null::timestamp`} ${scope}
          and coalesce(u.is_read, false) <> ${change.enabled}
          on conflict (user_id, article_id) do update set is_read = excluded.is_read, read_at = excluded.read_at
          where not user_articles.is_hidden`);
      } else if (change.kind === "starred") {
        await tx.execute(sql`insert into user_articles (user_id, article_id, is_starred)
          select s.user_id, a.id, ${change.enabled}::boolean ${scope} and coalesce(u.is_starred, false) <> ${change.enabled}
          on conflict (user_id, article_id) do update set is_starred = excluded.is_starred where not user_articles.is_hidden`);
      } else if (change.kind === "label" && change.enabled) {
        const [tag] = await tx
          .insert(tags)
          .values({ userId, name: change.name })
          .onConflictDoUpdate({
            target: [tags.userId, tags.name],
            set: { name: change.name },
          })
          .returning({ id: tags.id });
        await tx.execute(
          sql`insert into article_tags (article_id, tag_id) select a.id, ${tag.id}::uuid ${scope} on conflict do nothing`,
        );
      } else if (change.kind === "label") {
        await tx.execute(sql`delete from article_tags where tag_id in (select id from tags where user_id = ${userId} and name = ${change.name})
          and article_id in (select a.id ${scope})`);
      }
    }
  });
}

export type FeedEdit = {
  action: "subscribe" | "edit" | "unsubscribe";
  target: string;
  title?: string;
  add?: string;
  remove?: string;
};

export async function editClientFeed(userId: string, edit: FeedEdit) {
  return db.transaction(async (tx) => {
    const byTarget = or(sql`${feeds.id}::text = ${edit.target}`, eq(feeds.url, edit.target));
    let [feed] = await tx
      .select({ id: feeds.id, url: feeds.url, title: feeds.title })
      .from(feeds)
      .where(byTarget);
    if (!feed && edit.action === "subscribe" && /^https?:\/\//i.test(edit.target)) {
      [feed] = await tx
        .insert(feeds)
        .values({ url: edit.target })
        .onConflictDoUpdate({ target: feeds.url, set: { url: edit.target } })
        .returning({ id: feeds.id, url: feeds.url, title: feeds.title });
    }
    if (!feed) return null;
    const owned = and(eq(subscriptions.userId, userId), eq(subscriptions.feedId, feed.id));
    if (edit.action === "unsubscribe") {
      const removed = await tx
        .delete(subscriptions)
        .where(owned)
        .returning({ id: subscriptions.id });
      return removed.length ? feed : null;
    }
    if (edit.action === "subscribe")
      await tx.insert(subscriptions).values({ userId, feedId: feed.id }).onConflictDoNothing();
    const [sub] = await tx
      .select({ folderId: subscriptions.folderId })
      .from(subscriptions)
      .where(owned)
      .for("update");
    if (!sub) return null;
    let folderId = sub.folderId;
    if (edit.add) {
      const [folder] = await tx
        .insert(folders)
        .values({ userId, name: edit.add })
        .onConflictDoUpdate({ target: [folders.userId, folders.name], set: { name: edit.add } })
        .returning({ id: folders.id });
      folderId = folder.id;
    } else if (edit.remove && folderId) {
      const [folder] = await tx
        .select({ name: folders.name })
        .from(folders)
        .where(and(eq(folders.id, folderId), eq(folders.userId, userId)));
      if (folder?.name === edit.remove) folderId = null;
    }
    if (folderId !== sub.folderId || edit.title !== undefined) {
      await tx
        .update(subscriptions)
        .set({ folderId, customTitle: edit.title === undefined ? undefined : edit.title || null })
        .where(owned);
    }
    return feed;
  });
}
