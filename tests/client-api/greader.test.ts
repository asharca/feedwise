import { describe, expect, it } from "vitest";
import {
  itemId,
  itemSeq,
  parseStream,
  pageBySeq,
  clientLoginBody,
  LABEL,
  READING_LIST,
} from "@/lib/client-api/greader/protocol";
import { requestParams } from "@/lib/client-api/http";

it("formats ClientLogin for clients expecting all three plain-text lines", () => {
  expect(clientLoginBody("abc")).toBe("SID=abc\nLSID=null\nAuth=abc\n");
});

describe("stable item ids", () => {
  it.each([1, 16, 42, 2 ** 32 + 5, Number.MAX_SAFE_INTEGER])(
    "round-trips seq %s without 32-bit truncation",
    (seq) => {
      expect(itemSeq(itemId(seq))).toBe(seq);
      expect(itemSeq(String(seq))).toBe(seq);
    },
  );
  it("pads hexadecimal and interprets short ids as decimal", () => {
    expect(itemId(16)).toBe("tag:google.com,2005:reader/item/0000000000000010");
    expect(itemSeq("10")).toBe(10);
  });
  it.each([
    "",
    "0",
    "-4",
    "10x",
    "0xff",
    "1e2",
    "9007199254740992",
    "tag:google.com,2005:reader/item/ffffffffffffffff",
  ])("rejects malformed or inexact ids: %s", (value) => {
    expect(() => itemSeq(value)).toThrow();
  });
});

it("parses stream ids including literal slashes in folder/tag names", () => {
  expect(parseStream(READING_LIST)).toEqual({ kind: "reading-list" });
  expect(parseStream("starred")).toEqual({ kind: "starred" });
  expect(parseStream("user/123/state/com.google/read")).toEqual({ kind: "read" });
  expect(parseStream("feed/abc")).toEqual({ kind: "feed", value: "abc" });
  expect(parseStream(LABEL + "新闻/a+b")).toEqual({ kind: "label", value: "新闻/a+b" });
  expect(() => parseStream("user/-/label/")).toThrow();
  expect(() => parseStream("unknown")).toThrow();
});

it("continues after the last emitted seq, not the extra row or an offset", () => {
  for (const seqs of [
    [55, 21, 8],
    [8, 21, 55],
  ]) {
    const rows = seqs.map((seq) => ({ seq }));
    expect(pageBySeq(rows, 2)).toEqual({ items: rows.slice(0, 2), continuation: "21" });
    expect(pageBySeq(rows, 3)).toEqual({ items: rows });
  }
  expect(pageBySeq([], 2)).toEqual({ items: [] });
});

it("preserves repeated form fields without accepting form-only secrets from the URL", async () => {
  const req = new Request("https://example.org/?i=1&s=feed%2F2&api_key=exposed", {
    method: "POST",
    body: new URLSearchParams([
      ["i", "2"],
      ["i", "3"],
      ["T", "action"],
    ]),
  });
  const params = await requestParams(req, ["api_key"]);
  expect(params.getAll("i")).toEqual(["2", "3"]);
  expect(params.get("s")).toBe("feed/2");
  expect(params.has("api_key")).toBe(false);
});
