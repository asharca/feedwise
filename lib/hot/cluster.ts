import type { HotBoard, HotCluster } from "./types";

function titleTokens(title: string): Set<string> {
  const normalized = title.normalize("NFKC").toLowerCase();
  const tokens = new Set<string>();
  for (const match of normalized.matchAll(/[\p{Script=Han}]+|[a-z0-9]+/gu)) {
    const word = match[0];
    if (/^[a-z0-9]/.test(word)) tokens.add(word);
    else if (word.length === 1) tokens.add(word);
    else for (let i = 0; i < word.length - 1; i++) tokens.add(word.slice(i, i + 2));
  }
  return tokens;
}

/** Deterministic event clustering; a cluster contains at most one item per source. */
export function clusterHotItems(boards: HotBoard[]): HotCluster[] {
  const entries = boards
    .flatMap((board) =>
      board.items.map((item) => ({
        source: board.source,
        title: item.title,
        url: item.url,
        rank: item.rank,
      })),
    )
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.source.key.localeCompare(b.source.key) ||
        a.title.localeCompare(b.title),
    );
  const tokens = entries.map((entry) => titleTokens(entry.title));
  const parents = entries.map((_, i) => i);
  const sources = entries.map((entry) => new Set([entry.source.key]));
  function root(i: number): number {
    while (parents[i] !== i) {
      parents[i] = parents[parents[i]];
      i = parents[i];
    }
    return i;
  }
  const matches: Array<{ a: number; b: number; score: number }> = [];
  for (let a = 0; a < entries.length; a++) {
    if (tokens[a].size === 0) continue;
    for (let b = a + 1; b < entries.length; b++) {
      if (entries[a].source.key === entries[b].source.key) continue;
      let shared = 0;
      for (const token of tokens[a]) if (tokens[b].has(token)) shared++;
      const score = shared / (tokens[a].size + tokens[b].size - shared);
      // 0.42 tolerates headline suffixes, while requiring meaningful overlap.
      if (score >= 0.42 && (shared >= 3 || score === 1)) matches.push({ a, b, score });
    }
  }
  matches.sort((a, b) => b.score - a.score || a.a - b.a || a.b - b.b);
  for (const match of matches) {
    const a = root(match.a);
    const b = root(match.b);
    if (a === b || [...sources[a]].some((key) => sources[b].has(key))) continue;
    parents[b] = a;
    for (const key of sources[b]) sources[a].add(key);
  }
  const groups = new Map<number, typeof entries>();
  entries.forEach((entry, index) => {
    const key = root(index);
    const members = groups.get(key) ?? [];
    members.push(entry);
    groups.set(key, members);
  });
  return [...groups.values()]
    .filter((members) => members.length >= 2)
    .sort(
      (a, b) =>
        b.length - a.length || a[0].rank - b[0].rank || a[0].title.localeCompare(b[0].title),
    )
    .slice(0, 15)
    .map((members) => ({ title: members[0].title, sources: members }));
}
