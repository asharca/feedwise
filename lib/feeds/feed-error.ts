export type FeedErrorCode =
  | "network"
  | "timeout"
  | "http-4xx"
  | "http-5xx"
  | "not-feed"
  | "parse"
  | "unknown";

interface FeedErrorOptions {
  httpStatus?: number;
  cause?: unknown;
}

export class FeedError extends Error {
  readonly code: FeedErrorCode;
  readonly httpStatus?: number;

  constructor(code: FeedErrorCode, message: string, options: FeedErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "FeedError";
    this.code = code;
    this.httpStatus = options.httpStatus;
  }
}

const NETWORK_CODES = new Set([
  "ENOTFOUND",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "EPROTO",
  "CERT_HAS_EXPIRED",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
]);

const TIMEOUT_CODES = new Set(["ETIMEDOUT", "ESOCKETTIMEDOUT"]);

const PARSE_PATTERNS = [
  /not a feed/i,
  /unexpected end of/i,
  /invalid xml/i,
  /malformed/i,
  /parse error/i,
  /unclosed/i,
];

export function classifyError(err: unknown): FeedError {
  if (err instanceof FeedError) return err;

  if (!(err instanceof Error)) {
    return new FeedError("unknown", typeof err === "string" ? err : "Unknown error", {
      cause: err,
    });
  }

  const name = err.name ?? "";
  const message = err.message ?? "";
  const code = (err as NodeJS.ErrnoException).code;

  if (name === "AbortError" || name === "TimeoutError" || (code && TIMEOUT_CODES.has(code))) {
    return new FeedError("timeout", message || "Request timed out", { cause: err });
  }

  if (code && NETWORK_CODES.has(code)) {
    return new FeedError("network", message || "Network error", { cause: err });
  }

  if (PARSE_PATTERNS.some((re) => re.test(message))) {
    return new FeedError("parse", message, { cause: err });
  }

  return new FeedError("unknown", message || "Unknown error", { cause: err });
}

export function humanMessage(code: FeedErrorCode, httpStatus?: number): string {
  switch (code) {
    case "network":
      return "Network error — could not reach the server.";
    case "timeout":
      return "The server took too long to respond.";
    case "http-4xx":
      return httpStatus
        ? `The feed URL returned ${httpStatus} — it may have moved or been removed.`
        : "The feed URL returned a client error — it may have moved or been removed.";
    case "http-5xx":
      return httpStatus
        ? `The feed server returned ${httpStatus} — try again later.`
        : "The feed server returned a server error — try again later.";
    case "not-feed":
      return "That URL does not look like an RSS or Atom feed.";
    case "parse":
      return "Could not parse the feed — the content may be malformed.";
    case "unknown":
      return "Could not fetch the feed for an unexpected reason.";
  }
}

/**
 * Transient errors are expected to recover on their own (network blips,
 * timeouts, 5xx). Permanent errors (404, not-feed, parse) need user action.
 */
export function isTransient(code: FeedErrorCode): boolean {
  return code === "network" || code === "timeout" || code === "http-5xx" || code === "unknown";
}
