import { expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { scheduleFeedRefreshes } from "@/lib/jobs/scheduler";

const { execute, add } = vi.hoisted(() => ({ execute: vi.fn(), add: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { execute } }));
vi.mock("@/lib/jobs/queue", () => ({ getFeedFetchQueue: () => ({ add }) }));

it("claims once with a bounded locking lease and submits only returned rows", async () => {
  execute.mockImplementation(async (query: SQL) => {
    const statement = new PgDialect().sqlToQuery(query).sql.replace(/\s+/g, " ");
    expect(statement).toContain("exists (select 1 from subscriptions");
    expect(statement).toContain("limit 200 for update skip locked");
    expect(statement).toContain("update feeds set next_fetch_at = now() + interval '10 minutes'");
    return { rows: [{ id: "1", url: "u" }] };
  });
  expect(await scheduleFeedRefreshes()).toBe(1);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(add).toHaveBeenCalledExactlyOnceWith(
    "fetch",
    { feedId: "1", url: "u" },
    {
      jobId: "feed-1",
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
});
