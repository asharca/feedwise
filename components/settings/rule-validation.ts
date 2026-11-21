import type {
  RuleAction,
  RuleCondition,
  RuleField,
  RuleMatchMode,
  RuleOperator,
  RuleScope,
} from "@/lib/db/schema-types";

export const ARTICLE_RULE_FIELDS: readonly RuleField[] = [
  "title",
  "content",
  "author",
  "url",
  "feedId",
  "folderId",
];

export const HOT_RULE_FIELDS: readonly RuleField[] = ["title", "content", "url", "hotSource"];

export const RULE_FIELD_LABELS: Record<RuleField, string> = {
  title: "标题",
  content: "正文 / 摘要",
  author: "作者",
  url: "链接",
  feedId: "订阅源",
  folderId: "文件夹",
  hotSource: "热榜来源",
};

export const RULE_OPERATOR_LABELS: Record<RuleOperator, string> = {
  contains: "包含",
  notContains: "不包含",
  equals: "等于",
  notEquals: "不等于",
  regex: "正则匹配",
};

export const RULE_ACTION_LABELS: Record<RuleAction["type"], string> = {
  markRead: "标记已读",
  star: "加星收藏",
  hide: "隐藏文章",
  addTag: "添加标签",
  fetchFullText: "抓取全文",
  notify: "发送通知",
};

export const PICKER_FIELDS: Partial<Record<RuleField, true>> = {
  feedId: true,
  folderId: true,
  hotSource: true,
};

const TEXT_OPERATORS: readonly RuleOperator[] = [
  "contains",
  "notContains",
  "equals",
  "notEquals",
  "regex",
];

const PICKER_OPERATORS: readonly RuleOperator[] = ["equals", "notEquals"];

const ARTICLE_ACTION_TYPES: readonly RuleAction["type"][] = [
  "markRead",
  "star",
  "hide",
  "addTag",
  "fetchFullText",
  "notify",
];

const HOT_ACTION_TYPES: readonly RuleAction["type"][] = ["notify"];

export const MAX_REGEX_LENGTH = 200;

export function getAllowedFieldsForScope(scope: RuleScope): readonly RuleField[] {
  return scope === "hot" ? HOT_RULE_FIELDS : ARTICLE_RULE_FIELDS;
}

export function getAllowedOperatorsForField(field: RuleField): readonly RuleOperator[] {
  return PICKER_FIELDS[field] ? PICKER_OPERATORS : TEXT_OPERATORS;
}

export function getAllowedActionTypesForScope(scope: RuleScope): readonly RuleAction["type"][] {
  return scope === "hot" ? HOT_ACTION_TYPES : ARTICLE_ACTION_TYPES;
}

export function createDefaultCondition(_scope: RuleScope): RuleCondition {
  return { field: "title", op: "contains", value: "" };
}

export function createActionForType(type: RuleAction["type"]): RuleAction {
  switch (type) {
    case "markRead":
      return { type: "markRead" };
    case "star":
      return { type: "star" };
    case "hide":
      return { type: "hide" };
    case "addTag":
      return { type: "addTag", tagId: "" };
    case "fetchFullText":
      return { type: "fetchFullText" };
    case "notify":
      return { type: "notify", channelIds: [] };
  }
}

export function sanitizeDraftForScope(
  scope: RuleScope,
  conditions: RuleCondition[],
  actions: RuleAction[],
): { conditions: RuleCondition[]; actions: RuleAction[] } {
  const allowedFields = getAllowedFieldsForScope(scope);
  const nextConditions: RuleCondition[] = conditions.map((c) => {
    if (allowedFields.includes(c.field)) return c;
    return { field: "title", op: "contains", value: "" };
  });

  const allowedActions = getAllowedActionTypesForScope(scope);
  const filteredActions = actions.filter((a) => allowedActions.includes(a.type));
  const nextActions: RuleAction[] =
    filteredActions.length > 0
      ? filteredActions
      : [scope === "hot" ? { type: "notify", channelIds: [] } : { type: "markRead" }];

  return {
    conditions: nextConditions.length > 0 ? nextConditions : [createDefaultCondition(scope)],
    actions: nextActions,
  };
}

export function validateRuleConditions(
  scope: RuleScope,
  conditions: RuleCondition[],
): string | null {
  if (conditions.length === 0) {
    return "请至少添加一条匹配条件";
  }

  const allowedFields = getAllowedFieldsForScope(scope);
  for (let i = 0; i < conditions.length; i++) {
    const cond = conditions[i];
    const indexLabel = `第 ${i + 1} 条条件`;
    if (!allowedFields.includes(cond.field)) {
      return `${indexLabel}的字段「${RULE_FIELD_LABELS[cond.field] ?? cond.field}」不适用于当前作用域`;
    }
    const trimmed = cond.value.trim();
    if (!trimmed) {
      return `请填写${indexLabel}的匹配值`;
    }
    if (cond.op === "regex") {
      if (cond.value.length > MAX_REGEX_LENGTH) {
        return `${indexLabel}的正则表达式不能超过 ${MAX_REGEX_LENGTH} 个字符`;
      }
      try {
        new RegExp(cond.value);
      } catch {
        return `${indexLabel}的正则表达式语法无效`;
      }
    }
  }
  return null;
}

export interface RuleDraftInput {
  name: string;
  scope: RuleScope;
  matchMode: RuleMatchMode;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

export function validateRuleDraft(draft: RuleDraftInput): string | null {
  const trimmedName = draft.name.trim();
  if (!trimmedName) {
    return "请输入规则名称";
  }
  if (trimmedName.length > 100) {
    return "规则名称不能超过 100 个字符";
  }

  const condError = validateRuleConditions(draft.scope, draft.conditions);
  if (condError) return condError;

  if (draft.actions.length === 0) {
    return "请至少添加一个执行动作";
  }

  const allowedActionTypes = getAllowedActionTypesForScope(draft.scope);
  for (let i = 0; i < draft.actions.length; i++) {
    const action = draft.actions[i];
    const indexLabel = `第 ${i + 1} 个动作`;
    if (!allowedActionTypes.includes(action.type)) {
      return `${indexLabel}「${RULE_ACTION_LABELS[action.type]}」不适用于热榜规则（热榜规则仅支持发送通知）`;
    }
    if (action.type === "addTag" && !action.tagId.trim()) {
      return `${indexLabel}请选择要添加的标签`;
    }
    if (action.type === "notify" && action.channelIds.length === 0) {
      return `${indexLabel}请至少选择一个通知渠道`;
    }
  }

  return null;
}

export function reorderIds(ids: string[], fromIndex: number, toIndex: number): string[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= ids.length ||
    toIndex >= ids.length
  ) {
    return ids;
  }
  const next = [...ids];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
