import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { ReadableStream } from "node:stream/web";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Response } from "undici";
import {
  assertFetchableUrl,
  guardedLookup,
  isPublicAddress,
  readLimitedBytes,
  readLimitedText,
  ResponseTooLargeError,
  safeFetch,
  UnsafeUrlError,
} from "@/lib/net/safe-fetch";

function lookup(hostname: string) {
  return new Promise<{ code?: string; address: unknown }>((resolve) => {
    guardedLookup(hostname, {}, (err, address) => resolve({ code: err?.code, address }));
  });
}

describe("guardedLookup (connect-time DNS check)", () => {
  afterEach(() => {
    delete process.env.ALLOW_PRIVATE_NETWORK_FETCH;
  });

  it("refuses names that resolve to loopback", async () => {
    expect((await lookup("localhost")).code).toBe("EUNSAFEADDR");
  });

  it("refuses link-local metadata addresses", async () => {
    expect((await lookup("169.254.169.254")).code).toBe("EUNSAFEADDR");
  });

  it("allows private targets only when explicitly enabled", async () => {
    process.env.ALLOW_PRIVATE_NETWORK_FETCH = "1";
    const result = await lookup("127.0.0.1");
    expect(result.code).toBeUndefined();
    expect(result.address).toBe("127.0.0.1");
  });
});

describe("isPublicAddress", () => {
  it.each([
    ["8.8.8.8", true],
    ["2606:4700:4700::1111", true],
    ["127.0.0.1", false],
    ["10.1.2.3", false],
    ["172.16.0.1", false],
    ["192.168.1.1", false],
    ["169.254.169.254", false],
    ["100.64.0.1", false],
    ["0.0.0.0", false],
    ["::1", false],
    ["fc00::1", false],
    ["fe80::1", false],
    ["::ffff:127.0.0.1", false],
    ["::ffff:8.8.8.8", true],
    ["not-an-ip", false],
  ])("%s → %s", (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected);
  });
});

describe("assertFetchableUrl", () => {
  it.each([
    "file:///etc/passwd",
    "ftp://example.com/",
    "http://user:pass@example.com/",
    "http://localhost:3000/",
    "http://api.localhost/",
    "http://127.0.0.1/",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data",
    "http://[::ffff:10.0.0.1]/",
    "not a url",
  ])("rejects %s", (url) => {
    expect(() => assertFetchableUrl(url)).toThrow(UnsafeUrlError);
  });

  it("accepts public http(s) URLs", () => {
    expect(assertFetchableUrl("https://example.com/feed.xml").hostname).toBe("example.com");
  });
});

describe("safeFetch", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/redirect-file") {
        res.writeHead(302, { location: "file:///etc/passwd" });
        return res.end();
      }
      if (req.url === "/redirect-ok") {
        res.writeHead(301, { location: "/final" });
        return res.end();
      }
      if (req.url === "/loop") {
        res.writeHead(302, { location: "/loop" });
        return res.end();
      }
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("hello");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
  afterEach(() => {
    delete process.env.ALLOW_PRIVATE_NETWORK_FETCH;
  });

  it("refuses private targets by default", async () => {
    await expect(safeFetch(`${base}/`)).rejects.toThrow(UnsafeUrlError);
  });

  it("follows redirects and reports the final URL", async () => {
    process.env.ALLOW_PRIVATE_NETWORK_FETCH = "1";
    const response = await safeFetch(`${base}/redirect-ok`);
    expect(response.status).toBe(200);
    expect(response.url).toBe(`${base}/final`);
    expect(await readLimitedText(response)).toBe("hello");
  });

  it("re-validates every redirect hop", async () => {
    process.env.ALLOW_PRIVATE_NETWORK_FETCH = "1";
    await expect(safeFetch(`${base}/redirect-file`)).rejects.toThrow(UnsafeUrlError);
  });

  it("caps redirect chains", async () => {
    process.env.ALLOW_PRIVATE_NETWORK_FETCH = "1";
    await expect(safeFetch(`${base}/loop`, { maxRedirects: 2 })).rejects.toThrow(
      "Too many redirects",
    );
  });
});

describe("readLimitedBytes", () => {
  it("rejects bodies over the limit even without Content-Length", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 4; i++) controller.enqueue(new Uint8Array(10));
        controller.close();
      },
    });
    await expect(readLimitedBytes(new Response(stream), 25)).rejects.toThrow(ResponseTooLargeError);
  });

  it("rejects early on a declared Content-Length over the limit", async () => {
    const response = new Response("x".repeat(10), { headers: { "content-length": "999" } });
    await expect(readLimitedBytes(response, 100)).rejects.toThrow(ResponseTooLargeError);
  });

  it("decodes using the declared charset", async () => {
    const gbkBytes = new Uint8Array([0xc4, 0xe3, 0xba, 0xc3]); // "你好" in GBK
    const response = new Response(gbkBytes, {
      headers: { "content-type": "text/html; charset=gbk" },
    });
    expect(await readLimitedText(response)).toBe("你好");
  });
});
