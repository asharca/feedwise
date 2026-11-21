import type { SnippetPart } from "./parse-snippet";

// Same CJK ranges as feedwise_search_query. Match the original text, never
// the overlapping bigrams used to index it.
const cjk = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]+/u;
export const hasCjk = (query: string) => cjk.test(query);

export function highlightSubstring(text: string, query: string, maxLength = 180): SnippetPart[] {
  if (!text || maxLength <= 0) return [];
  const terms = query
    .trim()
    .split(/\s+/)
    .filter((t) => !t.startsWith("-"))
    .flatMap((t) => t.split(new RegExp(`(${cjk.source})`, "u")))
    .flatMap((t) => t.match(/[\p{L}\p{N}]+/gu) ?? [])
    .sort((a, b) => b.length - a.length);
  // Terms contain only letters and digits, not regexp syntax. Preserve the
  // matched spelling (e.g. case) rather than emitting the query itself.
  const matches = terms.length ? new RegExp(terms.join("|"), "giu") : null;
  const first = matches?.exec(text);
  let start = Math.max(0, (first?.index ?? 0) - Math.floor(maxLength / 3));
  if (start && /[\uDC00-\uDFFF]/.test(text[start])) start--;
  let end = Math.min(
    text.length,
    Math.max(start + maxLength, (first?.index ?? 0) + (first?.[0].length ?? 0)),
  );
  if (end < text.length && /[\uDC00-\uDFFF]/.test(text[end])) end++;
  const excerpt = text.slice(start, end);
  const parts: SnippetPart[] = [];
  let offset = 0;
  if (start) parts.push({ type: "text", value: "…" });
  if (matches && first) {
    matches.lastIndex = 0;
    for (const m of excerpt.matchAll(matches)) {
      if (m.index > offset) parts.push({ type: "text", value: excerpt.slice(offset, m.index) });
      parts.push({ type: "match", value: m[0] });
      offset = m.index + m[0].length;
    }
  }
  if (offset < excerpt.length) parts.push({ type: "text", value: excerpt.slice(offset) });
  if (end < text.length) parts.push({ type: "text", value: "…" });
  return parts;
}
