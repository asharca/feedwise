import { describe, it, expect } from "vitest";
import { ClusterSchema, ClusterResponseSchema } from "@/lib/digest/cluster-types";

const validId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

describe("ClusterSchema", () => {
  it("accepts a valid cluster", () => {
    const ok = ClusterSchema.safeParse({
      topic: "AI",
      headline: "OpenAI ships GPT-5",
      importance: 8,
      articleIds: [validId],
    });
    expect(ok.success).toBe(true);
  });

  it("rejects empty topic", () => {
    const r = ClusterSchema.safeParse({
      topic: "",
      headline: "x",
      importance: 5,
      articleIds: [validId],
    });
    expect(r.success).toBe(false);
  });

  it("rejects topic > 40 chars", () => {
    const r = ClusterSchema.safeParse({
      topic: "x".repeat(41),
      headline: "x",
      importance: 5,
      articleIds: [validId],
    });
    expect(r.success).toBe(false);
  });

  it("rejects headline > 120 chars", () => {
    const r = ClusterSchema.safeParse({
      topic: "AI",
      headline: "x".repeat(121),
      importance: 5,
      articleIds: [validId],
    });
    expect(r.success).toBe(false);
  });

  it("rejects importance out of 1-10", () => {
    expect(
      ClusterSchema.safeParse({ topic: "AI", headline: "x", importance: 0, articleIds: [validId] })
        .success,
    ).toBe(false);
    expect(
      ClusterSchema.safeParse({ topic: "AI", headline: "x", importance: 11, articleIds: [validId] })
        .success,
    ).toBe(false);
  });

  it("rejects non-uuid articleIds", () => {
    const r = ClusterSchema.safeParse({
      topic: "AI",
      headline: "x",
      importance: 5,
      articleIds: ["not-uuid"],
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty articleIds array", () => {
    const r = ClusterSchema.safeParse({
      topic: "AI",
      headline: "x",
      importance: 5,
      articleIds: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("ClusterResponseSchema", () => {
  it("rejects more than 50 clusters", () => {
    const clusters = Array.from({ length: 51 }, () => ({
      topic: "T",
      headline: "h",
      importance: 5,
      articleIds: [validId],
    }));
    const r = ClusterResponseSchema.safeParse({ clusters });
    expect(r.success).toBe(false);
  });

  it("accepts empty clusters array", () => {
    const r = ClusterResponseSchema.safeParse({ clusters: [] });
    expect(r.success).toBe(true);
  });
});
