import { expect, it } from "vitest";
import { planArticles, notifications } from "@/lib/rules/plan";
import type { RuleAction, RuleCondition } from "@/lib/db/schema-types";

const reader = "https://app.example/reader";
const rule = {
  userId: "alice",
  name: "books",
  folderId: "library",
  matchMode: "all" as const,
  conditions: [{ field: "folderId", op: "equals", value: "library" }] satisfies RuleCondition[],
  actions: [
    { type: "markRead" },
    { type: "star" },
    { type: "addTag", tagId: "tag" },
    { type: "fetchFullText" },
    { type: "notify", channelIds: ["chan", "chan"] },
  ] satisfies RuleAction[],
};
const items = Array.from({ length: 7 }, (_, i) => ({
  id: `${i}`,
  title: `News ${i}`,
  url: `https://news.example/${i}`,
}));

it("merges states across rules without mixing subscribers or duplicate tag/full-text work", () => {
  const plan = planArticles(
    [
      rule,
      { ...rule, actions: [{ type: "hide" }, { type: "addTag", tagId: "tag" }] },
      { ...rule, userId: "bob", folderId: "other" },
      { ...rule, userId: "cat", actions: [{ type: "fetchFullText" }, { type: "star" }] },
    ],
    items.slice(0, 1),
    reader,
  );
  expect(plan.states).toEqual([
    { userId: "alice", articleId: "0", read: true, star: true, hide: true },
    { userId: "cat", articleId: "0", read: false, star: true, hide: false },
  ]);
  expect(plan.tags).toEqual([{ userId: "alice", articleId: "0", tagId: "tag" }]);
  expect(plan.fullText).toEqual(["0"]);
  expect(plan.jobs).toEqual([
    {
      userId: "alice",
      channelId: "chan",
      message: { title: "News 0", body: "News 0", url: items[0].url, source: "books" },
    },
  ]);
});

it("queues once per matching (rule, channel); aggregate counts all hits but lists at most five", () => {
  const second = {
    ...rule,
    name: "second",
    actions: [{ type: "notify", channelIds: ["chan", "other"] }] satisfies RuleAction[],
  };
  const { jobs } = planArticles([rule, second], items, reader);
  expect(jobs.map((j) => [j.message.source, j.channelId])).toEqual([
    ["books", "chan"],
    ["second", "chan"],
    ["second", "other"],
  ]);
  expect(jobs[0].message).toEqual({
    title: "「books」命中 7 条",
    body: "News 0\nNews 1\nNews 2\nNews 3\nNews 4",
    url: reader,
    source: "books",
  });
  expect(notifications(rule, [], reader)).toEqual([]);
});
