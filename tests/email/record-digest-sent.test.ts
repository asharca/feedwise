// tests/email/record-digest-sent.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { emailSentArticles, emailDigestLogs, emailDigestLogArticles } from "@/lib/db/schema";

const h = vi.hoisted(() => {
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const tx = {
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        return {
          onConflictDoNothing: async () => undefined,
          returning: async () => [{ id: "log-1" }],
        };
      },
    }),
  };
  const transaction = vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx));
  return { inserts, transaction };
});

vi.mock("@/lib/db", () => ({ db: { transaction: h.transaction } }));

import { recordDigestSent } from "@/lib/email/digest-log";

beforeEach(() => {
  h.inserts.length = 0;
  h.transaction.mockClear();
});

describe("recordDigestSent", () => {
  it("writes sent-markers, log, and log-articles inside ONE transaction", async () => {
    const logId = await recordDigestSent("user-1", ["a1", "a2"], 2);
    expect(logId).toBe("log-1");
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.inserts.map((i) => i.table)).toEqual([
      emailSentArticles,
      emailDigestLogs,
      emailDigestLogArticles,
    ]);
    expect(h.inserts[0].values).toEqual([
      expect.objectContaining({ userId: "user-1", articleId: "a1" }),
      expect.objectContaining({ userId: "user-1", articleId: "a2" }),
    ]);
    expect(h.inserts[2].values).toEqual([
      expect.objectContaining({ logId: "log-1", articleId: "a1" }),
      expect.objectContaining({ logId: "log-1", articleId: "a2" }),
    ]);
  });

  it("with no articles, writes only the log row", async () => {
    await recordDigestSent("user-1", [], 0);
    expect(h.inserts.map((i) => i.table)).toEqual([emailDigestLogs]);
  });
});
