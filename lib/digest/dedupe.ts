import { canonicalizeUrl } from "./normalize-url";
import type { DigestArticle, DedupedArticle } from "./types";

function pickPrimary(articles: DigestArticle[]): DigestArticle {
  return articles.reduce((earliest, a) => {
    const ea = earliest.publishedAt?.getTime() ?? Infinity;
    const aa = a.publishedAt?.getTime() ?? Infinity;
    return aa < ea ? a : earliest;
  });
}

export function dedupeByCanonicalUrl(articles: DigestArticle[]): DedupedArticle[] {
  const groups = new Map<string, DigestArticle[]>();
  const singletons: DigestArticle[] = [];

  for (const a of articles) {
    const canonical = canonicalizeUrl(a.url);
    if (!canonical) {
      singletons.push(a);
      continue;
    }
    const existing = groups.get(canonical);
    if (existing) existing.push(a);
    else groups.set(canonical, [a]);
  }

  const out: DedupedArticle[] = [];
  for (const grouped of groups.values()) {
    const primary = pickPrimary(grouped);
    const duplicates = grouped.filter((a) => a.id !== primary.id);
    out.push({ primary, duplicates });
  }
  for (const a of singletons) out.push({ primary: a, duplicates: [] });
  return out;
}

function tokenize(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function dedupeByTitleSimilarity(
  items: DedupedArticle[],
  threshold: number
): DedupedArticle[] {
  const result: DedupedArticle[] = [];
  for (const item of items) {
    const title = item.primary.title?.trim() ?? "";
    if (title === "") {
      result.push(item);
      continue;
    }
    const tokens = tokenize(title);
    let mergedAt = -1;
    for (let i = 0; i < result.length; i++) {
      const existingTitle = result[i].primary.title?.trim() ?? "";
      if (existingTitle === "") continue;
      const existingTokens = tokenize(existingTitle);
      if (jaccard(tokens, existingTokens) >= threshold) {
        mergedAt = i;
        break;
      }
    }
    if (mergedAt === -1) {
      result.push(item);
      continue;
    }
    const existing = result[mergedAt];
    const combined: DigestArticle[] = [
      existing.primary,
      ...existing.duplicates,
      item.primary,
      ...item.duplicates,
    ];
    const newPrimary = pickPrimary(combined);
    result[mergedAt] = {
      primary: newPrimary,
      duplicates: combined.filter((c) => c.id !== newPrimary.id),
    };
  }
  return result;
}
