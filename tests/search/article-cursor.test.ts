import { describe, expect, it } from "vitest";
import { articlePage, decodeCursor, encodeCursor } from "@/lib/search/article-cursor";

const at = "2026-11-21T01:02:03.456789Z";
const id = "c7aa48b1-9cfc-4764-b244-79b4ffca92f0";
const cursor = encodeCursor({ at, id });

describe("article cursors", () => {
  it("round trips a URL-safe key without dropping microseconds", () => {
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(cursor)).toEqual({ at, id });
  });

  it.each([
    "",
    "!",
    cursor + "=",
    "a".repeat(257),
    encodeCursor({ at: "invalid", id }),
    encodeCursor({ at, id: "invalid" }),
  ])("rejects invalid cursor %s", (input) => {
    expect(decodeCursor(input)).toBeNull();
  });

  it("creates a cursor from the last returned row, not the lookahead row", () => {
    const rows = [
      { id, cursorAt: at },
      { id: "83edeed4-fafa-4442-9b34-6a44a017642c", cursorAt: at },
    ];
    expect(articlePage(rows, 1)).toEqual({ items: [{ id }], nextCursor: cursor });
    expect(articlePage(rows, 2).nextCursor).toBeNull();
    expect(articlePage([], 50)).toEqual({ items: [], nextCursor: null });
  });
});
