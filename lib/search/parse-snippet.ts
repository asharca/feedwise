export type SnippetPart =
  | { type: "text"; value: string }
  | { type: "match"; value: string };

const START = "⟦";
const END = "⟧";

export function parseSnippet(raw: string | null | undefined): SnippetPart[] {
  if (!raw) return [];
  const parts: SnippetPart[] = [];
  let i = 0;
  while (i < raw.length) {
    const start = raw.indexOf(START, i);
    if (start === -1) {
      if (i < raw.length) parts.push({ type: "text", value: raw.slice(i) });
      break;
    }
    if (start > i) parts.push({ type: "text", value: raw.slice(i, start) });
    const end = raw.indexOf(END, start + 1);
    if (end === -1) {
      parts.push({ type: "text", value: raw.slice(start) });
      break;
    }
    parts.push({ type: "match", value: raw.slice(start + 1, end) });
    i = end + 1;
  }
  return parts;
}

export const SNIPPET_START = START;
export const SNIPPET_END = END;
