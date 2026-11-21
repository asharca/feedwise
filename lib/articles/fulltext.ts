import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { articles } from "@/lib/db/schema";
import type { FullContentStatus } from "@/lib/db/schema-types";
import { getSubscribedArticle, getSubscriberUserIds } from "@/lib/db/queries/feeds";
import { publishEvent } from "@/lib/events/publisher";
import { safeFetch, readLimitedText } from "@/lib/net/safe-fetch";
import { absoluteUrl } from "@/lib/feeds/item";

const textTags = new Set(
  "article section div p span h1 h2 h3 h4 h5 h6 ul ol li dl dt dd pre code blockquote em strong b i u s sup sub figure figcaption table thead tbody tr th td caption time mark".split(
    " ",
  ),
);
const dropTags = new Set(
  "script style svg math form template iframe object embed noscript".split(" "),
);
const escapeHtml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Readability is an extractor, not a sanitizer. Emit just readable markup. */
function serialize(node: Node, base: string): string {
  if (node.nodeType === 3) return escapeHtml(node.textContent ?? "");
  if (node.nodeType !== 1) return "";
  const el = node as Element;
  const tag = el.localName.toLowerCase();
  if (dropTags.has(tag)) return "";
  if (tag === "br" || tag === "hr") return "<" + tag + ">";
  if (tag === "img") {
    const src = absoluteUrl(el.getAttribute("src") || el.getAttribute("data-src"), base);
    return src
      ? '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(el.getAttribute("alt") ?? "") + '">'
      : "";
  }
  const inner = Array.from(el.childNodes, (child) => serialize(child, base)).join("");
  if (tag === "a") {
    const href = absoluteUrl(el.getAttribute("href"), base);
    return href ? '<a href="' + escapeHtml(href) + '">' + inner + "</a>" : inner;
  }
  return textTags.has(tag) ? "<" + tag + ">" + inner + "</" + tag + ">" : inner;
}

export function extractFullText(body: string, url: string): string | null {
  const { document } = parseHTML(body);
  const base = absoluteUrl(document.querySelector("base[href]")?.getAttribute("href"), url) ?? url;
  Object.defineProperties(document, { baseURI: { value: base }, documentURI: { value: url } });
  const article = new Readability(document, {
    maxElemsToParse: 60_000,
    serializer: (node) => serialize(node, base),
  }).parse();
  return article?.textContent?.trim() && article.content ? article.content : null;
}

interface FullTextResult {
  status: FullContentStatus;
  html: string | null;
}

export async function readFullText(
  url: string | null,
  request = safeFetch,
): Promise<FullTextResult> {
  if (url) {
    try {
      const res = await request(url, {
        timeoutMs: 20_000,
        headers: { accept: "text/html,application/xhtml+xml" },
      });
      if (res.ok) {
        const html = extractFullText(await readLimitedText(res, 5 * 1024 * 1024), res.url || url);
        if (html) return { status: "ok", html };
      } else await res.body?.cancel();
    } catch {
      // Unreachable, oversized or unreadable pages are stored as a failed fetch.
    }
  }
  return { status: "failed", html: null };
}

export async function fetchFullText(
  articleId: string,
  userId?: string,
): Promise<FullTextResult | null> {
  const article =
    userId !== undefined
      ? await getSubscribedArticle(userId, articleId)
      : (
          await db
            .select({ feedId: articles.feedId, url: articles.url })
            .from(articles)
            .where(eq(articles.id, articleId))
        )[0];
  if (!article) return null;
  const result = await readFullText(article.url);
  await db
    .update(articles)
    .set({
      fullContentHtml: result.html,
      fullContentStatus: result.status,
      fullContentFetchedAt: new Date(),
    })
    .where(eq(articles.id, articleId));
  const subscribers = await getSubscriberUserIds(article.feedId);
  await Promise.all(
    subscribers.map((uid) => publishEvent(uid, { type: "article.updated", articleId })),
  );
  return result;
}
