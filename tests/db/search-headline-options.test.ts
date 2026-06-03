import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Regression: lib/db/queries/search.ts defines PostgreSQL ts_headline option
// strings (HEADLINE_OPTIONS_BODY / HEADLINE_OPTIONS_TITLE). When MinWords ==
// MaxWords, PostgreSQL rejects the query with "MinWords should be less than
// MaxWords". Because /api/search wraps searchArticles in Promise.allSettled,
// the rejection is swallowed and the UI silently shows zero results while
// /api/articles (the reader's list search, which doesn't use ts_headline)
// still works — matching the bug report "type to search shows nothing, Enter
// finds it".
//
// These tests read the source and assert the invariant the database requires.

const here = dirname(fileURLToPath(import.meta.url));
const searchModule = readFileSync(
  resolve(here, "../../lib/db/queries/search.ts"),
  "utf8"
);

function extractOption(name) {
  const re = new RegExp("HEADLINE_OPTIONS_" + name + "\\s*=\\s*`([^`]+)`");
  const m = searchModule.match(re);
  if (!m) throw new Error("HEADLINE_OPTIONS_" + name + " not found");
  return m[1];
}

function parseOptNumber(opt, key) {
  const m = opt.match(new RegExp(key + "=(\\d+)"));
  if (!m) throw new Error(key + " not in " + opt);
  return parseInt(m[1], 10);
}

describe("ts_headline option strings (search.ts)", () => {
  for (const name of ["BODY", "TITLE"]) {
    const opt = extractOption(name);

    it("HEADLINE_OPTIONS_" + name + " has MinWords strictly less than MaxWords", () => {
      const minWords = parseOptNumber(opt, "MinWords");
      const maxWords = parseOptNumber(opt, "MaxWords");
      expect(minWords).toBeLessThan(maxWords);
    });

    it("HEADLINE_OPTIONS_" + name + " has MinWords >= 5", () => {
      const minWords = parseOptNumber(opt, "MinWords");
      expect(minWords).toBeGreaterThanOrEqual(5);
    });
  }
});
