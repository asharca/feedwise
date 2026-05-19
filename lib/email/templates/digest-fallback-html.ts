import type { OrganizedDigest, DigestArticle } from "@/lib/digest/types";
import { safeSummaryHtml } from "./summary-html";

function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function renderArticleBlock(a: DigestArticle): string {
  return `
    <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #eee;">
      <h3 style="margin: 0 0 8px 0;">
        <a href="${esc(a.url)}" style="color: #2563eb; text-decoration: none;">${esc(a.title)}</a>
      </h3>
      <p style="margin: 0 0 8px 0; color: #666; font-size: 14px;">
        ${esc(a.feedTitle)} &middot; ${esc(fmtDate(a.publishedAt))}
      </p>
      <details style="margin-top: 8px;">
        <summary style="cursor: pointer; color: #2563eb; font-size: 13px; font-weight: 500;">Click to expand details</summary>
        <div style="margin-top: 8px; color: #444; font-size: 14px; line-height: 1.6;">
          ${safeSummaryHtml(a.summary) || '<p style="margin:0;color:#666;">No details available.</p>'}
        </div>
      </details>
    </div>`;
}

export function renderFallbackHtml(digest: OrganizedDigest): string {
  const banner = digest.mode === "fallback-llm-failed"
    ? `<p style="color:#94a3b8;font-size:12px;margin:0 0 12px 0;">Topic clustering unavailable for this digest.</p>`
    : "";
  const articles = digest.ungrouped.map(renderArticleBlock).join("");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:8px;">
        <tr><td style="padding:20px 30px;background:#1e293b;color:#fff;">
          <h1 style="margin:0;font-size:24px;">Today's Feedwise Digest</h1>
        </td></tr>
        <tr><td style="padding:30px;">
          ${banner}
          ${articles || '<p style="color:#666;">No articles today.</p>'}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
