import { describe, it, expect } from "vitest";
import { z } from "zod";

const PatchSchema = z.object({
  customTitle: z.string().max(500).optional(),
  folderId: z.string().uuid().nullable().optional(),
  feedUrl: z.string().url().optional(),
  fetchIntervalMinutes: z.number().int().min(5).max(1440).optional(),
});

describe("Feed interval validation", () => {
  it("accepts valid interval values", () => {
    for (const val of [5, 15, 30, 60, 120, 360, 720, 1440]) {
      const result = PatchSchema.safeParse({ fetchIntervalMinutes: val });
      expect(result.success).toBe(true);
    }
  });

  it("rejects intervals below 5 minutes", () => {
    const result = PatchSchema.safeParse({ fetchIntervalMinutes: 1 });
    expect(result.success).toBe(false);
  });

  it("rejects intervals above 1440 minutes (24h)", () => {
    const result = PatchSchema.safeParse({ fetchIntervalMinutes: 2000 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer intervals", () => {
    const result = PatchSchema.safeParse({ fetchIntervalMinutes: 30.5 });
    expect(result.success).toBe(false);
  });

  it("allows patch without fetchIntervalMinutes", () => {
    const result = PatchSchema.safeParse({ customTitle: "My Feed" });
    expect(result.success).toBe(true);
  });

  it("allows empty patch", () => {
    const result = PatchSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
