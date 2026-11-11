import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Route a remote image through /api/image-proxy. Pass `width` for anything
 * rendered as a thumbnail — the proxy downscales server-side (96 icons,
 * 480 grid cards, 1280 hero) so mobile browsers never decode full-size
 * originals. Omit it only where the image is shown at full size.
 */
export function proxyImg(
  url: string | null | undefined,
  width?: 96 | 480 | 1280,
): string | undefined {
  if (!url) return undefined;
  const w = width ? `&w=${width}` : "";
  return `/api/image-proxy?url=${encodeURIComponent(url)}${w}`;
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
};

/** Plain-text excerpt from feed HTML: drops tags, decodes common entities, collapses whitespace. */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (entity[0] === "#") {
        const code =
          entity[1] === "x" || entity[1] === "X"
            ? parseInt(entity.slice(2), 16)
            : parseInt(entity.slice(1), 10);
        return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, " ")
    .trim();
}
