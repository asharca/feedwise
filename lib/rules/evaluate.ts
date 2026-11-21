import type { RuleCondition, RuleField, RuleMatchMode } from "@/lib/db/schema-types";

export type RuleSubject = Partial<Record<RuleField, string | null>>;

export function compileRegex(value: string): RegExp {
  if (value.length > 200) throw new RangeError("正则表达式不能超过 200 个字符");
  return new RegExp(value, "i");
}

/** Compile once, then reuse the predicate for each item (including previews). */
export function compileRule(conditions: RuleCondition[], mode: RuleMatchMode) {
  const predicates = conditions.map(({ field, op, value }) => {
    const regex = op === "regex" ? compileRegex(value) : null;
    const needle = value.toLowerCase();
    return (subject: RuleSubject) => {
      const raw = subject[field] ?? "";
      const text =
        field === "content" ? raw.slice(0, 5000) : field === "title" ? raw.slice(0, 500) : raw;
      switch (op) {
        case "regex":
          return regex!.test(text);
        case "contains":
          return text.toLowerCase().includes(needle);
        case "notContains":
          return !text.toLowerCase().includes(needle);
        case "equals":
          return text === value;
        case "notEquals":
          return text !== value;
      }
    };
  });
  return (subject: RuleSubject): boolean =>
    predicates.length !== 0 &&
    (mode === "all"
      ? predicates.every((test) => test(subject))
      : predicates.some((test) => test(subject)));
}
