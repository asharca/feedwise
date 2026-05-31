import { describe, it, expect } from "vitest";
import {
  FeedError,
  classifyError,
  humanMessage,
  isTransient,
  type FeedErrorCode,
} from "@/lib/feeds/feed-error";

describe("FeedError", () => {
  it("carries code, message, and optional httpStatus", () => {
    const err = new FeedError("http-4xx", "Not Found", { httpStatus: 404 });
    expect(err.code).toBe("http-4xx");
    expect(err.message).toBe("Not Found");
    expect(err.httpStatus).toBe(404);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("classifyError", () => {
  it("returns the error unchanged when it is already a FeedError", () => {
    const original = new FeedError("not-feed", "Bad content");
    expect(classifyError(original)).toBe(original);
  });

  it("classifies AbortError as timeout", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    const fe = classifyError(abort);
    expect(fe.code).toBe("timeout");
  });

  it("classifies TimeoutError as timeout", () => {
    const t = new Error("timed out");
    t.name = "TimeoutError";
    expect(classifyError(t).code).toBe("timeout");
  });

  it("classifies DNS errors (ENOTFOUND) as network", () => {
    const e = Object.assign(new Error("getaddrinfo ENOTFOUND example.invalid"), {
      code: "ENOTFOUND",
    });
    expect(classifyError(e).code).toBe("network");
  });

  it("classifies ECONNREFUSED as network", () => {
    const e = Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });
    expect(classifyError(e).code).toBe("network");
  });

  it("classifies parse-related messages as parse", () => {
    expect(classifyError(new Error("Not a feed")).code).toBe("parse");
    expect(classifyError(new Error("Unexpected end of XML")).code).toBe("parse");
  });

  it("falls back to unknown for unrecognized errors", () => {
    expect(classifyError(new Error("¯\\_(ツ)_/¯")).code).toBe("unknown");
  });

  it("handles non-Error inputs", () => {
    expect(classifyError("oops").code).toBe("unknown");
    expect(classifyError(null).code).toBe("unknown");
  });
});

describe("humanMessage", () => {
  const codes: FeedErrorCode[] = [
    "network",
    "timeout",
    "http-4xx",
    "http-5xx",
    "not-feed",
    "parse",
    "unknown",
  ];

  it("returns a non-empty user-readable string for every code", () => {
    for (const code of codes) {
      const msg = humanMessage(code);
      expect(msg.length).toBeGreaterThan(0);
      // Should not be a raw error code (i.e. not the kebab-case)
      expect(msg).not.toBe(code);
    }
  });

  it("includes HTTP status when provided for http codes", () => {
    expect(humanMessage("http-4xx", 404)).toMatch(/404/);
    expect(humanMessage("http-5xx", 503)).toMatch(/503/);
  });
});

describe("isTransient", () => {
  it("returns true for transient codes that should auto-retry", () => {
    expect(isTransient("timeout")).toBe(true);
    expect(isTransient("network")).toBe(true);
    expect(isTransient("http-5xx")).toBe(true);
  });

  it("returns false for permanent codes", () => {
    expect(isTransient("http-4xx")).toBe(false);
    expect(isTransient("not-feed")).toBe(false);
    expect(isTransient("parse")).toBe(false);
  });

  it("treats unknown as transient (be lenient)", () => {
    expect(isTransient("unknown")).toBe(true);
  });
});
