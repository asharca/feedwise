# SSE Realtime Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push feed events (new articles, errors, deletes) from server to browser via SSE so the UI updates in real time without polling.

**Architecture:** Events originate in two places — the BullMQ feed-worker process and Next.js API routes. Both publish to a per-user Redis Pub/Sub channel (`feedwise:events:{userId}`). The SSE endpoint (`GET /api/sse`) subscribes to that channel and streams events to connected browsers. The browser uses a `useSSE` hook to react: the reader page reloads articles, the sidebar updates feed status.

**Tech Stack:** ioredis (already in use), Next.js App Router `ReadableStream` for SSE, Vitest for tests.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `lib/events/types.ts` | `FeedwiseEvent` union type |
| Create | `lib/events/publisher.ts` | `publishEvent(userId, event)` via Redis PUBLISH |
| Create | `app/api/sse/route.ts` | SSE endpoint — subscribes to Redis, streams events |
| Create | `lib/hooks/use-sse.ts` | `useSSE(handler)` hook — connects EventSource, calls handler |
| Create | `tests/events/publisher.test.ts` | Unit tests for publisher |
| Create | `tests/hooks/use-sse.test.ts` | Unit tests for useSSE hook |
| Modify | `lib/db/queries/feeds.ts` | Add `getSubscriberUserIds(feedId)` query |
| Modify | `lib/jobs/workers/feed-worker.ts` | Publish events after fetch |
| Modify | `app/api/feeds/[id]/route.ts` | Publish `feed.deleted` on DELETE |
| Modify | `app/(reader)/reader/page.tsx` | React to `articles.new` → reload list |
| Modify | `components/layout/app-sidebar.tsx` | React to `feed.deleted` / `feed.error` |

---

### Task 1: Event types

**Files:**
- Create: `lib/events/types.ts`

- [ ] **Step 1: Create the file**

```ts
// lib/events/types.ts

export type FeedwiseEvent =
  | { type: "articles.new"; feedId: string; count: number }
  | { type: "feed.fetched"; feedId: string }
  | { type: "feed.error"; feedId: string; errorCode: string; message: string }
  | { type: "feed.deleted"; subscriptionId: string; feedId: string };
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm build 2>&1 | tail -5
```

Expected: no errors related to `lib/events/types.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/events/types.ts
git commit -m "feat(sse): add FeedwiseEvent types"
```

---

### Task 2: Redis publisher

**Files:**
- Create: `lib/events/publisher.ts`
- Create: `tests/events/publisher.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/events/publisher.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ioredis before importing publisher
vi.mock("ioredis", () => {
  const publish = vi.fn().mockResolvedValue(1);
  const MockIORedis = vi.fn(() => ({ publish }));
  return { default: MockIORedis };
});

import IORedis from "ioredis";

describe("publishEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publishes a JSON-serialised event to feedwise:events:{userId}", async () => {
    const { publishEvent } = await import("@/lib/events/publisher");
    const mockInstance = (IORedis as unknown as ReturnType<typeof vi.fn>).mock.results[0].value as { publish: ReturnType<typeof vi.fn> };

    await publishEvent("user-123", { type: "articles.new", feedId: "feed-abc", count: 5 });

    expect(mockInstance.publish).toHaveBeenCalledWith(
      "feedwise:events:user-123",
      JSON.stringify({ type: "articles.new", feedId: "feed-abc", count: 5 }),
    );
  });

  it("does not throw if Redis publish fails", async () => {
    const { publishEvent } = await import("@/lib/events/publisher");
    const mockInstance = (IORedis as unknown as ReturnType<typeof vi.fn>).mock.results[0].value as { publish: ReturnType<typeof vi.fn> };
    mockInstance.publish.mockRejectedValueOnce(new Error("connection lost"));

    await expect(
      publishEvent("user-123", { type: "feed.fetched", feedId: "feed-abc" }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm test tests/events/publisher.test.ts 2>&1 | tail -10
```

Expected: `Cannot find module '@/lib/events/publisher'`.

- [ ] **Step 3: Create the publisher**

```ts
// lib/events/publisher.ts
import IORedis from "ioredis";
import type { FeedwiseEvent } from "./types";

let _pub: IORedis | null = null;

function getPub(): IORedis {
  if (!_pub) {
    _pub = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
  }
  return _pub;
}

export async function publishEvent(userId: string, event: FeedwiseEvent): Promise<void> {
  try {
    await getPub().publish(`feedwise:events:${userId}`, JSON.stringify(event));
  } catch (err) {
    console.error("[events/publisher] Failed to publish event:", err);
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm test tests/events/publisher.test.ts 2>&1 | tail -10
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/events/publisher.ts tests/events/publisher.test.ts
git commit -m "feat(sse): add Redis event publisher"
```

---

### Task 3: DB query — subscriber lookup

**Files:**
- Modify: `lib/db/queries/feeds.ts`

The feed-worker knows `feedId` but not which users are subscribed. Add a query to look that up.

- [ ] **Step 1: Add the query to `lib/db/queries/feeds.ts`**

Open the file and append after the existing exports:

```ts
export async function getSubscriberUserIds(feedId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.feedId, feedId));
  return rows.map((r) => r.userId);
}
```

Make sure `subscriptions` and `eq` are already imported (they are, from the existing file).

- [ ] **Step 2: Verify build**

```bash
pnpm build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/db/queries/feeds.ts
git commit -m "feat(sse): add getSubscriberUserIds query"
```

---

### Task 4: SSE endpoint

**Files:**
- Create: `app/api/sse/route.ts`

- [ ] **Step 1: Create the route**

```ts
// app/api/sse/route.ts
import IORedis from "ioredis";
import { requireSession } from "@/lib/auth/session";

const HEARTBEAT_INTERVAL_MS = 30_000;
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export async function GET(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;
  const channel = `feedwise:events:${userId}`;

  const sub = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let enqueueFn: ((chunk: string) => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      enqueueFn = (chunk: string) => {
        try {
          controller.enqueue(new TextEncoder().encode(chunk));
        } catch {
          // controller already closed (client disconnected)
        }
      };

      sub.subscribe(channel, (err) => {
        if (err) console.error("[sse] subscribe error:", err);
      });

      sub.on("message", (_ch: string, message: string) => {
        enqueueFn?.(`data: ${message}\n\n`);
      });

      heartbeatTimer = setInterval(() => {
        enqueueFn?.(`: heartbeat\n\n`);
      }, HEARTBEAT_INTERVAL_MS);
    },
    cancel() {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      sub.unsubscribe(channel).then(() => sub.disconnect()).catch(() => sub.disconnect());
    },
  });

  // Also clean up when client disconnects (abort signal)
  req.signal.addEventListener("abort", () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    sub.unsubscribe(channel).then(() => sub.disconnect()).catch(() => sub.disconnect());
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm build 2>&1 | tail -10
```

Expected: no TypeScript errors.

- [ ] **Step 3: Smoke-test manually**

With `pnpm dev:all` running:

```bash
curl -N -H "Cookie: <paste your session cookie from browser>" http://localhost:3000/api/sse
```

Expected: connection stays open, `: heartbeat` lines appear every 30s. Without a valid cookie expect `Unauthorized`.

- [ ] **Step 4: Commit**

```bash
git add app/api/sse/route.ts
git commit -m "feat(sse): add SSE endpoint with Redis subscriber"
```

---

### Task 5: useSSE hook

**Files:**
- Create: `lib/hooks/use-sse.ts`
- Create: `tests/hooks/use-sse.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/hooks/use-sse.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { FeedwiseEvent } from "@/lib/events/types";

// Minimal EventSource mock
class MockEventSource {
  static instances: MockEventSource[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  url: string;
  closed = false;
  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  close() { this.closed = true; }
  emit(data: string) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
}

vi.stubGlobal("EventSource", MockEventSource);

beforeEach(() => {
  MockEventSource.instances = [];
});

describe("useSSE", () => {
  it("connects to /api/sse on mount", async () => {
    const { useSSE } = await import("@/lib/hooks/use-sse");
    renderHook(() => useSSE(() => {}));
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe("/api/sse");
  });

  it("calls handler with parsed event when message arrives", async () => {
    const { useSSE } = await import("@/lib/hooks/use-sse");
    const handler = vi.fn();
    renderHook(() => useSSE(handler));

    const es = MockEventSource.instances[0];
    const event: FeedwiseEvent = { type: "articles.new", feedId: "f1", count: 3 };
    es.emit(JSON.stringify(event));

    expect(handler).toHaveBeenCalledWith(event);
  });

  it("closes EventSource on unmount", async () => {
    const { useSSE } = await import("@/lib/hooks/use-sse");
    const { unmount } = renderHook(() => useSSE(() => {}));
    const es = MockEventSource.instances[0];
    unmount();
    expect(es.closed).toBe(true);
  });
});
```

- [ ] **Step 2: Install test dependency if needed**

```bash
pnpm list @testing-library/react 2>/dev/null | grep testing-library || pnpm add -D @testing-library/react
```

Update `vitest.config.ts` to add jsdom environment if not already present:

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "jsdom",
  },
});
```

- [ ] **Step 3: Run — expect FAIL**

```bash
pnpm test tests/hooks/use-sse.test.ts 2>&1 | tail -10
```

Expected: `Cannot find module '@/lib/hooks/use-sse'`.

- [ ] **Step 4: Create the hook**

```ts
// lib/hooks/use-sse.ts
"use client";

import { useEffect, useRef } from "react";
import type { FeedwiseEvent } from "@/lib/events/types";

export function useSSE(handler: (event: FeedwiseEvent) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const es = new EventSource("/api/sse");
    es.onmessage = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data as string) as FeedwiseEvent;
        handlerRef.current(event);
      } catch {
        // malformed message — ignore
      }
    };
    return () => es.close();
  }, []);
}
```

- [ ] **Step 5: Run — expect PASS**

```bash
pnpm test tests/hooks/use-sse.test.ts 2>&1 | tail -10
```

Expected: `3 passed`.

- [ ] **Step 6: Commit**

```bash
git add lib/hooks/use-sse.ts tests/hooks/use-sse.test.ts vitest.config.ts
git commit -m "feat(sse): add useSSE hook"
```

---

### Task 6: Integrate publisher into feed-worker

**Files:**
- Modify: `lib/jobs/workers/feed-worker.ts`

- [ ] **Step 1: Add imports at the top of `lib/jobs/workers/feed-worker.ts`**

Add after existing imports:

```ts
import { publishEvent } from "@/lib/events/publisher";
import { getSubscriberUserIds } from "@/lib/db/queries/feeds";
```

- [ ] **Step 2: Publish on success — replace the early return after `parsed.articles.length === 0`**

Find this block (around line 32–50):

```ts
if (parsed.articles.length === 0) return;

await db
  .insert(articles)
  .values(
    parsed.articles.map((a) => ({
      ...
    })),
  )
  .onConflictDoNothing();
```

Replace with:

```ts
const subscriberIds = await getSubscriberUserIds(feedId);

if (parsed.articles.length === 0) {
  await Promise.all(
    subscriberIds.map((uid) => publishEvent(uid, { type: "feed.fetched", feedId })),
  );
  return;
}

const inserted = await db
  .insert(articles)
  .values(
    parsed.articles.map((a) => ({
      feedId,
      guid: a.guid,
      url: a.url ?? undefined,
      title: a.title ?? undefined,
      author: a.author ?? undefined,
      contentHtml: a.contentHtml ?? undefined,
      contentText: a.contentText ?? undefined,
      summary: a.summary ?? undefined,
      imageUrl: a.imageUrl ?? undefined,
      publishedAt: a.publishedAt ?? undefined,
    })),
  )
  .onConflictDoNothing()
  .returning({ id: articles.id });

const newCount = inserted.length;
await Promise.all(
  subscriberIds.map((uid) =>
    publishEvent(uid, { type: "articles.new", feedId, count: newCount }),
  ),
);
```

- [ ] **Step 3: Publish on error — in the catch block, add after updating the DB**

Find the catch block. After `await db.update(feeds).set({...}).where(...)`, add:

```ts
const subscriberIds = await getSubscriberUserIds(feedId).catch(() => []);
await Promise.all(
  subscriberIds.map((uid) =>
    publishEvent(uid, {
      type: "feed.error",
      feedId,
      errorCode: feedError.code,
      message,
    }),
  ),
);
```

- [ ] **Step 4: Verify build**

```bash
pnpm build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/jobs/workers/feed-worker.ts
git commit -m "feat(sse): publish articles.new / feed.error events from feed-worker"
```

---

### Task 7: Integrate publisher into DELETE route

**Files:**
- Modify: `app/api/feeds/[id]/route.ts`

The DELETE handler currently calls `unsubscribeFeed(userId, id)` without knowing the feedId. We need feedId to publish the event. Use `getFeedFromSubscription` to look it up before deleting.

- [ ] **Step 1: Add imports**

Add to the import block in `app/api/feeds/[id]/route.ts`:

```ts
import { getFeedFromSubscription } from "@/lib/db/queries/feeds";
import { publishEvent } from "@/lib/events/publisher";
```

- [ ] **Step 2: Replace the DELETE handler**

Replace the entire `DELETE` function:

```ts
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;

    // Look up feedId before deleting so we can include it in the event.
    const feed = await getFeedFromSubscription(session.user.id, id);

    await unsubscribeFeed(session.user.id, id);

    if (feed) {
      await publishEvent(session.user.id, {
        type: "feed.deleted",
        subscriptionId: id,
        feedId: feed.feedId,
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}
```

- [ ] **Step 3: Verify build**

```bash
pnpm build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/feeds/[id]/route.ts
git commit -m "feat(sse): publish feed.deleted event on unsubscribe"
```

---

### Task 8: Reader page — react to articles.new

**Files:**
- Modify: `app/(reader)/reader/page.tsx`

- [ ] **Step 1: Add import at the top of `app/(reader)/reader/page.tsx`**

```ts
import { useSSE } from "@/lib/hooks/use-sse";
```

- [ ] **Step 2: Add `reloadKey` state near the other useState declarations**

Find the existing state declarations (around the top of the component). Add:

```ts
const [reloadKey, setReloadKey] = useState(0);
```

- [ ] **Step 3: Add useSSE listener inside the component**

Add after the `reloadKey` state declaration:

```ts
useSSE((event) => {
  if (event.type !== "articles.new") return;
  // Reload if we're viewing all feeds, or this specific feed
  if (!feedId || feedId === event.feedId) {
    setReloadKey((k) => k + 1);
  }
});
```

- [ ] **Step 4: Add `reloadKey` to the fetchArticles useEffect dependency array**

Find the `useEffect` that calls `fetchArticles` (the one with the AbortController). It currently ends with:

```ts
}, [fetchArticles, showDashboard, PAGE_SIZE]);
```

Change to:

```ts
}, [fetchArticles, showDashboard, PAGE_SIZE, reloadKey]);
```

- [ ] **Step 5: Verify build**

```bash
pnpm build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 6: Manual end-to-end test**

1. Run `pnpm dev:all`
2. Open the reader in a browser
3. Open browser DevTools → Network → filter by `sse`
4. Verify the `/api/sse` connection is open (status 200, type `eventsource`)
5. In another terminal, manually trigger a feed refresh:
   ```bash
   curl -X POST http://localhost:3000/api/feeds/<subscriptionId>/refresh \
     -H "Cookie: <session cookie>"
   ```
6. Watch DevTools EventStream tab — `articles.new` event should appear
7. Article list in reader should reload

- [ ] **Step 7: Commit**

```bash
git add "app/(reader)/reader/page.tsx"
git commit -m "feat(sse): reload article list on articles.new event"
```

---

### Task 9: Sidebar — react to feed.deleted and feed.error

**Files:**
- Modify: `components/layout/app-sidebar.tsx`

- [ ] **Step 1: Add import**

```ts
import { useSSE } from "@/lib/hooks/use-sse";
```

- [ ] **Step 2: Add useSSE listener inside the component**

Find the existing state (`const [subs, setSubs] = useState(initialSubs)`). After it, add:

```ts
useSSE((event) => {
  if (event.type === "feed.deleted") {
    setSubs((prev) => prev.filter((s) => s.id !== event.subscriptionId));
  }
  if (event.type === "feed.error") {
    setSubs((prev) =>
      prev.map((s) =>
        s.feedId === event.feedId
          ? { ...s, lastFetchError: event.message }
          : s,
      ),
    );
  }
});
```

- [ ] **Step 3: Verify build**

```bash
pnpm build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 4: Run full test suite**

```bash
pnpm test 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 5: Manual test — multi-tab feed.deleted sync**

1. Open two browser tabs both showing the reader
2. In Tab A, right-click a feed → "Delete" (or use the dropdown)
3. Tab B's sidebar should remove that feed without refresh

- [ ] **Step 6: Commit**

```bash
git add components/layout/app-sidebar.tsx
git commit -m "feat(sse): sync feed.deleted and feed.error to sidebar via SSE"
```

---

## Done

All four real-time events are wired:
- `articles.new` → reader reloads article list
- `feed.fetched` → published (no UI action; available for future use)
- `feed.error` → sidebar shows error state in real time
- `feed.deleted` → sidebar removes feed across all tabs
