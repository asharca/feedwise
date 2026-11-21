import type { RuleAction, RuleCondition, RuleMatchMode } from "@/lib/db/schema-types";
import type { NotifyJob } from "@/lib/notify/message";
import { compileRule, type RuleSubject } from "./evaluate";

export interface RuleItem extends RuleSubject {
  id: string;
  title: string;
  url: string | null;
}

interface Rule {
  name: string;
  userId: string;
  matchMode: RuleMatchMode;
  actions: RuleAction[];
  conditions: RuleCondition[];
}

export function notifications(rule: Rule, hits: RuleItem[], readerUrl: string): NotifyJob[] {
  if (!hits.length) return [];
  const channels = new Set(rule.actions.flatMap((a) => (a.type === "notify" ? a.channelIds : [])));
  const message = {
    title: hits.length === 1 ? hits[0].title : `「${rule.name}」命中 ${hits.length} 条`,
    body: hits
      .slice(0, 5)
      .map((item) => item.title)
      .join("\n"),
    url: hits.length === 1 ? (hits[0].url ?? readerUrl) : readerUrl,
    source: rule.name,
  };
  return Array.from(channels, (channelId) => ({ userId: rule.userId, channelId, message }));
}

export interface ArticleState {
  userId: string;
  articleId: string;
  read: boolean;
  star: boolean;
  hide: boolean;
}
export interface TagAssignment {
  userId: string;
  articleId: string;
  tagId: string;
}

export function planArticles(
  rules: Array<Rule & { folderId: string | null }>,
  articles: RuleItem[],
  readerUrl: string,
) {
  const states = new Map<string, ArticleState>();
  const tags = new Map<string, TagAssignment>();
  const fullText = new Set<string>();
  const jobs: NotifyJob[] = [];
  for (const rule of rules) {
    const matches = compileRule(rule.conditions, rule.matchMode);
    const hits = articles.filter((item) => matches({ ...item, folderId: rule.folderId }));
    jobs.push(...notifications(rule, hits, readerUrl));
    for (const { id: articleId } of hits) {
      for (const action of rule.actions) {
        if (action.type === "notify") continue;
        if (action.type === "fetchFullText") fullText.add(articleId);
        else if (action.type === "addTag") {
          tags.set(`${rule.userId}:${articleId}:${action.tagId}`, {
            userId: rule.userId,
            articleId,
            tagId: action.tagId,
          });
        } else {
          const key = `${rule.userId}:${articleId}`;
          const state = states.get(key) ?? {
            userId: rule.userId,
            articleId,
            read: false,
            star: false,
            hide: false,
          };
          if (action.type === "markRead") state.read = true;
          if (action.type === "star") state.star = true;
          if (action.type === "hide") state.hide = true;
          states.set(key, state);
        }
      }
    }
  }
  return { states: [...states.values()], tags: [...tags.values()], fullText: [...fullText], jobs };
}
