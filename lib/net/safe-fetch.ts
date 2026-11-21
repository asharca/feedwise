import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import ipaddr from "ipaddr.js";
import { Agent, fetch as undiciFetch, type RequestInit, type Response } from "undici";

/**
 * Outbound HTTP for any URL that a user (or a feed) controls.
 *
 * Every connection — including each redirect hop — resolves DNS through a
 * lookup hook that refuses non-public addresses, so a hostile URL cannot
 * reach loopback, private networks, link-local cloud metadata, etc. The check
 * happens at connect time, which also defeats DNS rebinding.
 *
 * Set ALLOW_PRIVATE_NETWORK_FETCH=1 to allow private targets (local dev only).
 */

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export class ResponseTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`Response exceeds ${maxBytes} bytes`);
    this.name = "ResponseTooLargeError";
  }
}

export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;

/** True for globally routable unicast addresses only (IPv4-mapped IPv6 is unwrapped). */
export function isPublicAddress(address: string): boolean {
  return ipaddr.isValid(address) && ipaddr.process(address).range() === "unicast";
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/** Connect-time DNS hook used by the shared agent; exported for tests. */
export function guardedLookup(hostname: string, options: object, callback: LookupCallback): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const list = addresses as LookupAddress[]; // `all: true` always yields an array
    if (process.env.ALLOW_PRIVATE_NETWORK_FETCH !== "1") {
      if (list.some((entry) => !isPublicAddress(entry.address))) {
        return callback(
          Object.assign(new UnsafeUrlError("Refusing to connect to a non-public address"), {
            code: "EUNSAFEADDR",
          }),
          [],
        );
      }
    }
    if ("all" in options && options.all) return callback(null, list);
    const first = list[0];
    if (!first) return callback(Object.assign(new Error("No address"), { code: "ENOTFOUND" }), []);
    callback(null, first.address, first.family);
  });
}

let _agent: Agent | null = null;
function getAgent(): Agent {
  if (!_agent) {
    _agent = new Agent({
      connect: { lookup: guardedLookup as never },
      headersTimeout: DEFAULT_TIMEOUT_MS,
      bodyTimeout: DEFAULT_TIMEOUT_MS,
    });
  }
  return _agent;
}

/** Syntactic checks that don't need DNS: scheme, credentials, literal IPs, localhost. */
export function assertFetchableUrl(input: string | URL): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeUrlError("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http(s) URLs are allowed");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs with credentials are not allowed");
  }
  if (process.env.ALLOW_PRIVATE_NETWORK_FETCH !== "1") {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const isLocalName = host === "localhost" || host.endsWith(".localhost");
    if (isLocalName || (ipaddr.isValid(host) && !isPublicAddress(host))) {
      throw new UnsafeUrlError("Refusing to fetch a non-public address");
    }
  }
  return url;
}

export interface SafeFetchOptions extends Omit<RequestInit, "redirect" | "signal" | "dispatcher"> {
  timeoutMs?: number;
  maxRedirects?: number;
  signal?: AbortSignal;
}

/**
 * fetch() with SSRF protection, a total timeout and manual redirect handling
 * (each hop is re-validated). Returns the final response; `response.url` is
 * the final URL. Read bodies with `readLimited*` to cap memory use.
 */
export async function safeFetch(
  input: string | URL,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    signal,
    ...init
  } = options;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  let url = assertFetchableUrl(input);
  for (let hop = 0; ; hop++) {
    const response = await undiciFetch(url, {
      ...init,
      redirect: "manual",
      signal: combined,
      dispatcher: getAgent(),
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel().catch(() => {});
      if (hop >= maxRedirects) throw new UnsafeUrlError("Too many redirects");
      url = assertFetchableUrl(new URL(location, url));
      continue;
    }
    // undici only fills response.url when it follows redirects itself.
    if (!response.url) Object.defineProperty(response, "url", { value: url.toString() });
    return response;
  }
}

/** Read a response body, aborting once it exceeds `maxBytes`. */
export async function readLimitedBytes(
  response: Response,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new ResponseTooLargeError(maxBytes);
  }
  if (!response.body) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      await response.body.cancel().catch(() => {});
      throw new ResponseTooLargeError(maxBytes);
    }
    chunks.push(chunk);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Decode a limited body as text, honouring the charset in Content-Type (default UTF-8). */
export async function readLimitedText(
  response: Response,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<string> {
  const bytes = await readLimitedBytes(response, maxBytes);
  const charset = /charset=([^;]+)/i.exec(response.headers.get("content-type") ?? "")?.[1]?.trim();
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}
