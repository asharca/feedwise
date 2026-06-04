import { describe, it, expect } from "vitest";
import {
  filtersFromParams,
  applyFiltersToParams,
  type PageSearchFilters,
} from "@/app/(reader)/reader/_search-view/use-page-search";

describe("filtersFromParams", () => {
  it("returns all-false for empty params", () => {
    const f = filtersFromParams(new URLSearchParams());
    expect(f).toEqual({
      feedId: undefined,
      folderId: undefined,
      tagId: undefined,
      since: undefined,
      unread: false,
      starred: false,
    });
  });

  it("reads each filter from its own key", () => {
    const f = filtersFromParams(new URLSearchParams("feedId=f1&folderId=d1&tag=t1&since=7d"));
    expect(f.feedId).toBe("f1");
    expect(f.folderId).toBe("d1");
    expect(f.tagId).toBe("t1");
    expect(f.since).toBe("7d");
  });

  it("maps view=unread to unread=true", () => {
    expect(filtersFromParams(new URLSearchParams("view=unread")).unread).toBe(true);
    expect(filtersFromParams(new URLSearchParams("view=unread")).starred).toBe(false);
  });

  it("maps view=starred to starred=true", () => {
    expect(filtersFromParams(new URLSearchParams("view=starred")).starred).toBe(true);
    expect(filtersFromParams(new URLSearchParams("view=starred")).unread).toBe(false);
  });

  it("leaves search= untouched (it is the q, not a filter)", () => {
    const f = filtersFromParams(new URLSearchParams("search=商业体"));
    expect(f).toEqual({
      feedId: undefined,
      folderId: undefined,
      tagId: undefined,
      since: undefined,
      unread: false,
      starred: false,
    });
  });
});

describe("applyFiltersToParams", () => {
  it("preserves unrelated params (e.g. search, articleId)", () => {
    const p = new URLSearchParams("search=商业体&articleId=a1");
    applyFiltersToParams(p, { unread: false, starred: false });
    expect(p.get("search")).toBe("商业体");
    expect(p.get("articleId")).toBe("a1");
  });

  it("sets feed/folder/tag/since keys", () => {
    const p = new URLSearchParams();
    applyFiltersToParams(p, {
      feedId: "f1",
      folderId: "d1",
      tagId: "t1",
      since: "7d",
      unread: false,
      starred: false,
    });
    expect(p.get("feedId")).toBe("f1");
    expect(p.get("folderId")).toBe("d1");
    expect(p.get("tag")).toBe("t1"); // note: tagId is written as "tag" in URL
    expect(p.get("since")).toBe("7d");
  });

  it("removes a key when the filter is cleared (undefined)", () => {
    const p = new URLSearchParams("feedId=f1&folderId=d1");
    applyFiltersToParams(p, {
      feedId: undefined,
      folderId: "d1",
      unread: false,
      starred: false,
    });
    expect(p.has("feedId")).toBe(false);
    expect(p.get("folderId")).toBe("d1");
  });

  it("starred wins over unread when both are set", () => {
    const p = new URLSearchParams();
    applyFiltersToParams(p, { unread: true, starred: true });
    expect(p.get("view")).toBe("starred");
  });

  it("removes view= when neither unread nor starred", () => {
    const p = new URLSearchParams("view=unread");
    applyFiltersToParams(p, { unread: false, starred: false });
    expect(p.has("view")).toBe(false);
  });
});

describe("roundtrip", () => {
  it("filtersFromParams(applyFiltersToParams(p, filters)) === filters", () => {
    const start: PageSearchFilters = {
      feedId: "f1",
      folderId: undefined,
      tagId: "t1",
      since: "today",
      unread: true,
      starred: false,
    };
    const p = new URLSearchParams("search=商业体&articleId=a1");
    applyFiltersToParams(p, start);
    const round = filtersFromParams(p);
    expect(round).toEqual(start);
  });
});
