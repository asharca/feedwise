import {
  claimHotHits,
  enabledHotRules,
  newArticleSubjects,
  subscriberRules,
  writeArticleActions,
} from "@/lib/db/queries/rules";
import { enqueueFullText } from "@/lib/jobs/queues/fulltext";
import { enqueueNotification } from "@/lib/jobs/queues/notify";
import { compileRule } from "./evaluate";
import { notifications, planArticles } from "./plan";

function readerUrl() {
  return `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")}/reader`;
}

export async function applyRulesToNewArticles(feedId: string, articleIds: string[]): Promise<void> {
  try {
    if (!articleIds.length) return;
    const rows = await subscriberRules(feedId);
    if (!rows.length) return;
    const items = await newArticleSubjects(feedId, articleIds);
    const plan = planArticles(
      rows.map(({ rule, folderId }) => ({ ...rule, folderId })),
      items,
      readerUrl(),
    );
    await writeArticleActions(plan.states, plan.tags);
    await Promise.all([
      ...plan.fullText.map((id) => enqueueFullText(id)),
      ...plan.jobs.map((job) => enqueueNotification(job)),
    ]);
  } catch (error) {
    console.error("[rules] article batch failed", feedId, error);
  }
}

export async function applyRulesToNewHotItems(
  items: Array<{ id: string; sourceKey: string; title: string; url: string; desc: string | null }>,
): Promise<void> {
  try {
    if (!items.length) return;
    const byId = new Map(
      items.map((item) => [item.id, { ...item, content: item.desc, hotSource: item.sourceKey }]),
    );
    for (const rule of await enabledHotRules()) {
      try {
        const hits = [...byId.values()].filter(compileRule(rule.conditions, rule.matchMode));
        if (!hits.length) continue;
        const claimed = new Set(
          (
            await claimHotHits(
              rule.id,
              hits.map((item) => item.id),
            )
          ).map((row) => row.id),
        );
        const jobs = notifications(
          rule,
          hits.filter((item) => claimed.has(item.id)),
          readerUrl(),
        );
        await Promise.all(jobs.map((job) => enqueueNotification(job)));
      } catch (error) {
        console.error("[rules] hot rule failed", rule.id, error);
      }
    }
  } catch (error) {
    console.error("[rules] hot batch failed", error);
  }
}
