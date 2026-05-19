import type { OrganizedDigest, DigestArticle, TopicGroup, TopHeadline } from "@/lib/digest/types";
import { safeSummaryHtml } from "./summary-html";

function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function topicAnchor(topic: string): string {
  return "topic-" + topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function renderHeadline(h: TopHeadline, i: number): string {
  const num = ["(1)", "(2)", "(3)", "(4)", "(5)"][i] ?? `(${i + 1})`;
  return `
    <div style="margin-bottom:10px;">
      <span style="color:#94a3b8;font-variant-numeric:tabular-nums;">${num}</span>
      <a href="#${topicAnchor(h.cluster.topic)}" style="color:#2563eb;text-decoration:none;font-weight:500;">${esc(h.cluster.headline)}</a>
      <span style="color:#94a3b8;font-size:12px;"> &middot; ${esc(h.cluster.topic)} &middot; ${h.sourceCount} sources &middot; &#9733; ${h.cluster.importance}</span>
    </div>`;
}

function renderClusterBlock(c: TopicGroup["clusters"][number]): string {
  const dup = c.duplicates.length;
  const dupBlock = dup > 0
    ? `<details style="margin-top:6px;"><summary style="cursor:pointer;color:#2563eb;font-size:12px;">+${dup} other source${dup === 1 ? "" : "s"}</summary>
        <ul style="margin:6px 0 0 16px;padding:0;color:#666;font-size:12px;">
          ${c.duplicates.map((d) => `<li><a href="${esc(d.url)}" style="color:#2563eb;text-decoration:none;">${esc(d.title)}</a> &middot; ${esc(d.feedTitle)}</li>`).join("")}
        </ul></details>`
    : "";
  return `
    <div style="margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid #eee;">
      <a href="${esc(c.primary.url)}" style="color:#111;text-decoration:none;font-weight:500;font-size:15px;">${esc(c.primary.title)}</a>
      <div style="color:#94a3b8;font-size:12px;margin-top:2px;">${esc(c.primary.feedTitle)} &middot; ${esc(fmtDate(c.primary.publishedAt))}</div>
      ${c.primary.summary ? `<div style="color:#444;font-size:13px;line-height:1.55;margin-top:6px;">${safeSummaryHtml(c.primary.summary)}</div>` : ""}
      ${dupBlock}
    </div>`;
}

function renderTopicGroup(g: TopicGroup): string {
  return `
    <div id="${topicAnchor(g.topic)}" style="margin-top:28px;">
      <h2 style="margin:0 0 12px 0;font-size:16px;color:#111;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">${esc(g.topic)} <span style="color:#94a3b8;font-size:12px;font-weight:normal;">(${g.totalCount})</span></h2>
      ${g.clusters.map(renderClusterBlock).join("")}
    </div>`;
}

function renderUngrouped(items: DigestArticle[]): string {
  if (items.length === 0) return "";
  return `
    <div style="margin-top:28px;">
      <h2 style="margin:0 0 12px 0;font-size:16px;color:#111;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">Ungrouped <span style="color:#94a3b8;font-size:12px;font-weight:normal;">(${items.length})</span></h2>
      ${items.map((a) => `
        <div style="margin-bottom:14px;">
          <a href="${esc(a.url)}" style="color:#111;text-decoration:none;font-weight:500;font-size:14px;">${esc(a.title)}</a>
          <div style="color:#94a3b8;font-size:12px;">${esc(a.feedTitle)} &middot; ${esc(fmtDate(a.publishedAt))}</div>
        </div>`).join("")}
    </div>`;
}

export function renderDigestHtml(digest: OrganizedDigest): string {
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
          <h2 style="margin:0 0 14px 0;font-size:13px;color:#94a3b8;letter-spacing:0.08em;">TOP HEADLINES</h2>
          ${digest.topHeadlines.map(renderHeadline).join("")}
          ${digest.topicGroups.map(renderTopicGroup).join("")}
          ${renderUngrouped(digest.ungrouped)}
        </td></tr>
        <tr><td style="padding:14px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;text-align:center;">
          Feedwise daily digest.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
