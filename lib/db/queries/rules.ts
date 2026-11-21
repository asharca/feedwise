import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  articles,
  feeds,
  hotItems,
  hotRanks,
  hotSnapshots,
  notificationChannels,
  ruleHotHits,
  rules,
  subscriptions,
  tags,
  userArticles,
  users,
} from "@/lib/db/schema";
import type { RuleAction } from "@/lib/db/schema-types";
import type { ArticleState, TagAssignment } from "@/lib/rules/plan";
import type { RuleInput } from "@/lib/rules/validation";

type RuleRow = typeof rules.$inferSelect;
const owned = (userId: string, id: string) => and(eq(rules.userId, userId), eq(rules.id, id));
export function listRules(userId: string) {
  return db
    .select()
    .from(rules)
    .where(eq(rules.userId, userId))
    .orderBy(asc(rules.position), asc(rules.id));
}

export async function ownsReferences(userId: string, actions: RuleAction[]) {
  const tagIds = [...new Set(actions.flatMap((a) => (a.type === "addTag" ? [a.tagId] : [])))];
  const channelIds = [
    ...new Set(actions.flatMap((a) => (a.type === "notify" ? a.channelIds : []))),
  ];
  const [t, c] = await Promise.all([
    tagIds.length
      ? db
          .select({ id: tags.id })
          .from(tags)
          .where(and(eq(tags.userId, userId), inArray(tags.id, tagIds)))
      : [],
    channelIds.length
      ? db
          .select({ id: notificationChannels.id })
          .from(notificationChannels)
          .where(
            and(
              eq(notificationChannels.userId, userId),
              inArray(notificationChannels.id, channelIds),
            ),
          )
      : [],
  ]);
  return t.length === tagIds.length && c.length === channelIds.length;
}

export function createRule(userId: string, input: RuleInput) {
  return db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [last] = await tx
      .select({ position: rules.position })
      .from(rules)
      .where(eq(rules.userId, userId))
      .orderBy(desc(rules.position))
      .limit(1);
    const [row] = await tx
      .insert(rules)
      .values({ ...input, userId, position: (last?.position ?? -1) + 1 })
      .returning();
    return row;
  });
}

export function updateRule(
  userId: string,
  id: string,
  build: (current: RuleRow) => Promise<RuleInput>,
) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(rules).where(owned(userId, id)).for("update");
    if (!current) return null;
    const input = await build(current);
    const [row] = await tx
      .update(rules)
      .set({ ...input, updatedAt: new Date() })
      .where(owned(userId, id))
      .returning();
    return row;
  });
}

export async function deleteRule(userId: string, id: string) {
  const [row] = await db.delete(rules).where(owned(userId, id)).returning({ id: rules.id });
  return row;
}

export function reorderRules(userId: string, ids: string[]) {
  return db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const current = await tx
      .select({ id: rules.id })
      .from(rules)
      .where(eq(rules.userId, userId))
      .for("update");
    const wanted = new Set(ids);
    if (current.length !== ids.length || !current.every((r) => wanted.has(r.id))) return false;
    await tx.execute(sql`update rules set position = ord - 1, updated_at = now()
      from jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb) with ordinality as ordering(id, ord)
      where rules.user_id = ${userId} and rules.id = ordering.id::uuid`);
    return true;
  });
}

const articleFields = {
  id: articles.id,
  feedId: articles.feedId,
  url: articles.url,
  author: articles.author,
  title: sql<string>`coalesce(${articles.title}, '')`,
  content: sql<string>`left(concat_ws(E'\\n', ${articles.contentText}, ${articles.summary}), 5000)`,
};

export function newArticleSubjects(feedId: string, ids: string[]) {
  return db
    .select(articleFields)
    .from(articles)
    .where(and(eq(articles.feedId, feedId), inArray(articles.id, ids)))
    .orderBy(desc(articles.sortAt), desc(articles.id));
}

export function subscriberRules(feedId: string) {
  return db
    .select({ rule: rules, folderId: subscriptions.folderId })
    .from(rules)
    .innerJoin(
      subscriptions,
      and(eq(subscriptions.userId, rules.userId), eq(subscriptions.feedId, feedId)),
    )
    .where(and(eq(rules.enabled, true), eq(rules.scope, "article")))
    .orderBy(asc(rules.position), asc(rules.id));
}

export function enabledHotRules() {
  return db
    .select()
    .from(rules)
    .where(and(eq(rules.enabled, true), eq(rules.scope, "hot")))
    .orderBy(asc(rules.position), asc(rules.id));
}

export function claimHotHits(ruleId: string, ids: string[]) {
  return db
    .insert(ruleHotHits)
    .values(ids.map((itemId) => ({ ruleId, itemId })))
    .onConflictDoNothing()
    .returning({ id: ruleHotHits.itemId });
}

/** JSON recordsets keep the parameter count independent of subscriber and item counts. */
export async function writeArticleActions(states: ArticleState[], assignments: TagAssignment[]) {
  if (!states.length && !assignments.length) return;
  await db.transaction(async (tx) => {
    if (states.length)
      await tx.execute(sql`
      insert into user_articles (user_id, article_id, is_read, read_at, is_starred, is_hidden)
      select "userId", "articleId", read, case when read then now() end, star, hide
      from jsonb_to_recordset(${JSON.stringify(states)}::jsonb)
        as s("userId" text, "articleId" uuid, read boolean, star boolean, hide boolean)
      order by "userId", "articleId"
      on conflict (user_id, article_id) do update set
        is_read = user_articles.is_read or excluded.is_read,
        read_at = coalesce(user_articles.read_at, excluded.read_at),
        is_starred = user_articles.is_starred or excluded.is_starred,
        is_hidden = user_articles.is_hidden or excluded.is_hidden`);
    if (assignments.length)
      await tx.execute(sql`
      insert into article_tags (article_id, tag_id, source)
      select a."articleId", t.id, 'user'
      from jsonb_to_recordset(${JSON.stringify(assignments)}::jsonb) as a("userId" text, "articleId" uuid, "tagId" uuid)
      join tags t on t.id = a."tagId" and t.user_id = a."userId"
      order by a."articleId", t.id on conflict do nothing`);
  });
}

export function previewArticles(userId: string, since: Date, offset: number, limit: number) {
  return db
    .select({
      ...articleFields,
      folderId: subscriptions.folderId,
      at: articles.sortAt,
      source: sql<string>`coalesce(${subscriptions.customTitle}, ${feeds.title}, ${feeds.url})`,
    })
    .from(subscriptions)
    .innerJoin(articles, eq(articles.feedId, subscriptions.feedId))
    .innerJoin(feeds, eq(feeds.id, articles.feedId))
    .leftJoin(
      userArticles,
      and(eq(userArticles.articleId, articles.id), eq(userArticles.userId, userId)),
    )
    .where(
      and(
        eq(subscriptions.userId, userId),
        gte(articles.sortAt, since),
        sql`${userArticles.isHidden} is not true`,
      ),
    )
    .orderBy(desc(articles.sortAt), desc(articles.id))
    .offset(offset)
    .limit(limit);
}

export function previewHotItems() {
  const latest = db
    .selectDistinctOn([hotSnapshots.sourceKey], { id: hotSnapshots.id })
    .from(hotSnapshots)
    .orderBy(hotSnapshots.sourceKey, desc(hotSnapshots.capturedAt), desc(hotSnapshots.id))
    .as("latest");
  return db
    .select({
      id: hotItems.id,
      title: hotItems.title,
      url: hotItems.url,
      content: hotItems.desc,
      hotSource: hotItems.sourceKey,
      source: hotItems.sourceKey,
      at: hotItems.lastSeenAt,
    })
    .from(latest)
    .innerJoin(hotRanks, eq(hotRanks.snapshotId, latest.id))
    .innerJoin(hotItems, eq(hotItems.id, hotRanks.itemId))
    .orderBy(desc(hotItems.lastSeenAt), hotRanks.rank, hotItems.id);
}
