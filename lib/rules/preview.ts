import { previewArticles, previewHotItems } from "@/lib/db/queries/rules";
import { compileRule, type RuleSubject } from "./evaluate";
import type { RuleInput } from "./validation";

export async function previewRule(
  userId: string,
  input: Pick<RuleInput, "scope" | "matchMode" | "conditions">,
) {
  const matches: Array<{
    id: string;
    title: string;
    source: string;
    url: string | null;
    at: string | null;
  }> = [];
  if (!input.conditions.length) return { matches };
  const test = compileRule(input.conditions, input.matchMode);
  const collect = (
    rows: Array<
      RuleSubject & { id: string; title: string; url: string | null; at: Date; source: string }
    >,
  ) => {
    for (const item of rows) {
      if (!test(item)) continue;
      const { id, title, url, at, source } = item;
      matches.push({ id, title, url, source, at: at.toISOString() });
      if (matches.length === 20) break;
    }
  };
  if (input.scope === "hot") collect(await previewHotItems());
  else {
    const since = new Date(Date.now() - 7 * 86400_000);
    const pageSize = 256;
    for (let offset = 0; matches.length < 20; offset += pageSize) {
      const rows = await previewArticles(userId, since, offset, pageSize);
      collect(rows);
      if (rows.length < pageSize) break;
    }
  }
  return { matches };
}
