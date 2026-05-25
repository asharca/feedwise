/** Plain-text, length-clamped brief derived from a (possibly HTML) summary. */
export function briefText(summary: string | null | undefined, maxLen = 140): string {
  if (!summary) return "";
  const text = summary
    .replace(/<[^>]*>/g, " ")
    // Decode the entities common in RSS/blog content to their characters.
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;|&#8230;/g, "…")
    .replace(/&rsquo;|&#8217;/g, "’")
    .replace(/&lsquo;|&#8216;/g, "‘")
    .replace(/&ldquo;|&#8220;/g, "“")
    .replace(/&rdquo;|&#8221;/g, "”")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    // Drop any remaining unrecognized entities so they don't render literally.
    .replace(/&[a-z][a-z0-9]*;|&#\d+;|&#x[0-9a-f]+;/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1).trimEnd() + "…";
}
