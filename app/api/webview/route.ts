import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";

const BLOCKED_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function toAbsolute(value: string, base: URL): string {
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("#")
  ) return value;
  if (trimmed.startsWith("//")) return `${base.protocol}${trimmed}`;
  try {
    return new URL(trimmed, base).href;
  } catch {
    return value;
  }
}

function rewriteHtml(html: string, base: URL, serverOrigin: string): string {
  const proxyUrl = (abs: string) => `${serverOrigin}/api/webview?url=${encodeURIComponent(abs)}`;

  // Route <link rel="stylesheet"> through our proxy to bypass CDN hotlink protection
  html = html.replace(
    /(<link\b[^>]*\brel=(["'])stylesheet\2[^>]*\bhref=(["']))(.*?)\3/gi,
    (_, prefix, _q1, _q2, href) => {
      const abs = toAbsolute(href, base);
      return `${prefix}${proxyUrl(abs)}"`;
    }
  );
  // Also handle href before rel
  html = html.replace(
    /(<link\b[^>]*\bhref=(["']))(.*?)\2([^>]*\brel=(["'])stylesheet\5)/gi,
    (_, prefix, _q, href, suffix) => {
      const abs = toAbsolute(href, base);
      return `${prefix}${proxyUrl(abs)}"${suffix}`;
    }
  );

  // Rewrite src, action, data-src to absolute URLs
  html = html.replace(
    /((?:src|action|data-src|data-href)\s*=\s*)(["'])(.*?)\2/gi,
    (match, attr, quote, value) => {
      const abs = toAbsolute(value, base);
      return abs !== value ? `${attr}${quote}${abs}${quote}` : match;
    }
  );

  // Rewrite url() in inline <style> blocks through proxy
  html = html.replace(
    /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_, open, css, close) => {
      const rewritten = css.replace(
        /url\((["']?)((?!data:)[^"')]+)\1\)/gi,
        (_m: string, q: string, u: string) => {
          const abs = toAbsolute(u.trim(), base);
          return `url(${q}${proxyUrl(abs)}${q})`;
        }
      );
      return `${open}${rewritten}${close}`;
    }
  );

  html = html.replace(/<base[^>]*>/gi, "");
  html = html.replace(/(<head[^>]*>)/i, `$1<base href="${base.origin}/">`);

  return html;
}

export async function GET(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("Missing url", { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return new NextResponse("Unsupported protocol", { status: 400 });
  }

  if (BLOCKED_HOSTS.some((h) => parsed.hostname === h)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
      },
      redirect: "follow",
    });
  } catch (err) {
    return new NextResponse(
      err instanceof Error ? err.message : "Failed to fetch",
      { status: 502 }
    );
  }

  const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

  if (!res.ok) {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:2rem;color:#888">
        <p>无法加载页面（${res.status}）</p>
        <p style="font-size:12px">${url}</p>
      </body></html>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", ...CORS } }
    );
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    const body = await res.arrayBuffer();
    return new NextResponse(body, { headers: { "Content-Type": contentType, ...CORS } });
  }

  const html = rewriteHtml(await res.text(), parsed, req.nextUrl.origin);

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS,
    },
  });
}
