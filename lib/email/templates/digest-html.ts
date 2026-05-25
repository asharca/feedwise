import type { OrganizedDigest, DigestArticle, TopicGroup, TopHeadline } from "@/lib/digest/types";
import { briefText } from "../brief";

export type LinkFn = (article: DigestArticle) => string;
const defaultLink: LinkFn = (a) => a.url ?? "";

function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function renderHeadline(h: TopHeadline, i: number, link: LinkFn): string {
  const num = `(${i + 1})`;
  return `
    <div style="margin-bottom:10px;">
      <span style="color:#94a3b8;font-variant-numeric:tabular-nums;">${num}</span>
      <a href="${esc(link(h.primaryArticle))}" style="color:#2563eb;text-decoration:none;font-weight:500;">${esc(h.cluster.headline)}</a>
      <span style="color:#94a3b8;font-size:12px;"> &middot; ${esc(h.cluster.topic)} &middot; ${h.sourceCount} source${h.sourceCount === 1 ? "" : "s"} &middot; &#9733; ${h.cluster.importance}</span>
    </div>`;
}

function renderItem(primary: DigestArticle, dupCount: number, link: LinkFn): string {
  const brief = briefText(primary.summary);
  const sources = dupCount > 0 ? ` &middot; ${dupCount + 1} sources` : "";
  return `
    <div style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #eee;">
      <a href="${esc(link(primary))}" style="color:#111;text-decoration:none;font-weight:500;font-size:15px;">${esc(primary.title)}</a>
      <div style="color:#94a3b8;font-size:12px;margin-top:2px;">${esc(primary.feedTitle)} &middot; ${esc(fmtDate(primary.publishedAt))}${sources}</div>
      ${brief ? `<div style="color:#444;font-size:13px;line-height:1.55;margin-top:6px;">${esc(brief)}</div>` : ""}
    </div>`;
}

function renderTopicGroup(g: TopicGroup, link: LinkFn): string {
  return `
    <div style="margin-top:28px;">
      <h2 style="margin:0 0 12px 0;font-size:16px;color:#111;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">${esc(g.topic)} <span style="color:#94a3b8;font-size:12px;font-weight:normal;">(${g.totalCount})</span></h2>
      ${g.clusters.map((c) => renderItem(c.primary, c.duplicates.length, link)).join("")}
    </div>`;
}

function renderUngrouped(items: DigestArticle[], link: LinkFn): string {
  if (items.length === 0) return "";
  return `
    <div style="margin-top:28px;">
      <h2 style="margin:0 0 12px 0;font-size:16px;color:#111;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">More <span style="color:#94a3b8;font-size:12px;font-weight:normal;">(${items.length})</span></h2>
      ${items.map((a) => renderItem(a, 0, link)).join("")}
    </div>`;
}

export function renderDigestHtml(digest: OrganizedDigest, buildLink: LinkFn = defaultLink): string {
  const dateStr = digest.date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border-radius:8px;">
        <tr><td style="padding:18px 28px;border-bottom:1px solid #e2e8f0;">
          <div style="color:#111;font-size:18px;font-weight:600;">Feedwise Digest</div>
          <div style="color:#94a3b8;font-size:12px;margin-top:2px;">${esc(dateStr)} &middot; ${digest.totalArticles} articles &middot; ${digest.topicCount} topics</div>
        </td></tr>
        <tr><td style="padding:24px 28px;">
          ${digest.topHeadlines.length > 0 ? `<h2 style="margin:0 0 14px 0;font-size:13px;color:#94a3b8;letter-spacing:0.08em;">TOP STORIES</h2>${digest.topHeadlines.map((h, i) => renderHeadline(h, i, buildLink)).join("")}` : ""}
          ${digest.topicGroups.map((g) => renderTopicGroup(g, buildLink)).join("")}
          ${renderUngrouped(digest.ungrouped, buildLink)}
        </td></tr>
        <tr><td style="padding:14px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;text-align:center;">
          Feedwise daily digest.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
