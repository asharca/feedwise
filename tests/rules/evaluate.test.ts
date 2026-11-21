import { describe, expect, it } from "vitest";
import { compileRule } from "@/lib/rules/evaluate";
import { previewSchema, ruleSchema } from "@/lib/rules/validation";
import type { RuleCondition, RuleOperator } from "@/lib/db/schema-types";

const condition = (op: RuleOperator, value: string): RuleCondition => ({
  field: "title",
  op,
  value,
});

describe("rule predicates", () => {
  it.each<[RuleOperator, string, boolean]>([
    ["contains", "CAR", true],
    ["contains", "cat", false],
    ["notContains", "CAR", false],
    ["notContains", "bike", true],
    ["equals", "racecar", true],
    ["equals", "Racecar", false],
    ["notEquals", "racecar", false],
    ["notEquals", "Racecar", true],
    ["regex", "^RACE.*r$", true],
    ["regex", "^car", false],
  ])("%s %s → %s", (op, value, expected) => {
    const test = compileRule([condition(op, value)], "all");
    expect(test({ title: "racecar" })).toBe(expected);
    expect(test({ title: "racecar" })).toBe(expected);
  });

  it("uses AND / OR; empty is never a catch-all", () => {
    const cs = [condition("contains", "abc"), condition("contains", "xyz")];
    expect(compileRule(cs, "all")({ title: "ABC" })).toBe(false);
    expect(compileRule(cs, "all")({ title: "xYz abc" })).toBe(true);
    expect(compileRule(cs, "any")({ title: "ABC" })).toBe(true);
    expect(compileRule(cs, "any")({ title: null })).toBe(false);
    expect(compileRule([], "all")({})).toBe(false);
    expect(compileRule([], "any")({})).toBe(false);
  });

  it.each([
    ["title", 500],
    ["content", 5000],
  ] as const)("bounds %s at %i characters", (field, limit) => {
    const test = compileRule([{ field, op: "regex", value: "x$" }], "all");
    expect(test({ [field]: "a".repeat(limit - 1) + "x" })).toBe(true);
    expect(test({ [field]: "a".repeat(limit) + "x" })).toBe(false);
  });
});

describe("rule input validation", () => {
  const base = {
    scope: "article",
    matchMode: "all",
    conditions: [],
    actions: [],
    name: "r",
    enabled: true,
  };
  it.each(["[", "x".repeat(201)])("rejects invalid or overlong regex", (pattern) => {
    expect(
      ruleSchema.safeParse({ ...base, conditions: [condition("regex", pattern)] }).success,
    ).toBe(false);
    expect(() => compileRule([condition("regex", pattern)], "all")).toThrow();
  });
  it("accepts 200 characters", () => {
    expect(
      ruleSchema.safeParse({ ...base, conditions: [condition("regex", "x".repeat(200))] }).success,
    ).toBe(true);
  });
  it("checks scope on actions, fields and previews", () => {
    expect(
      ruleSchema.safeParse({ ...base, scope: "hot", actions: [{ type: "hide" }] }).success,
    ).toBe(false);
    expect(
      previewSchema.safeParse({
        scope: "hot",
        matchMode: "all",
        conditions: [{ field: "author", op: "equals", value: "a" }],
      }).success,
    ).toBe(false);
    expect(
      previewSchema.safeParse({
        scope: "article",
        matchMode: "all",
        conditions: [{ field: "hotSource", op: "equals", value: "a" }],
      }).success,
    ).toBe(false);
  });
});
