/**
 * Sanitize RSS-supplied summary HTML for safe email rendering.
 *
 * We do NOT do full HTML sanitization (RSS summaries are HTML by convention
 * and stripping all tags would degrade reading quality). Match the prior
 * lib/email/sender.ts behavior:
 *   1. Strip <details>/<summary> tags so source-side disclosures can't hide
 *      article titles in some mail clients.
 *   2. Clamp inline images to a max size so oversized media doesn't bloat
 *      the email layout.
 *
 * Follow-up: consider server-side sanitize-html for stricter XSS hardening.
 */
const IMAGE_STYLE =
  "max-width:100%;width:auto;height:auto;max-height:280px;object-fit:contain;display:block;border-radius:8px;margin:8px 0;";

function clampInlineImages(html: string): string {
  return html.replace(/<img\b([^>]*)>/gi, (_m, attrs: string) => {
    const styleMatch = attrs.match(/\sstyle\s*=\s*(['"])(.*?)\1/i);
    if (styleMatch) {
      const merged = `${styleMatch[2].trim().replace(/;?$/, ";")} ${IMAGE_STYLE}`;
      return `<img${attrs.replace(styleMatch[0], ` style="${merged}"`)}>`;
    }
    return `<img${attrs} style="${IMAGE_STYLE}">`;
  });
}

export function safeSummaryHtml(summary: string | null | undefined): string {
  if (!summary || summary.trim().length === 0) return "";
  const stripped = summary
    .replace(/<\/?details\b[^>]*>/gi, "")
    .replace(/<\/?summary\b[^>]*>/gi, "");
  return clampInlineImages(stripped);
}
