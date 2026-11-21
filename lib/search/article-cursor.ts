import { z } from "zod";

// Keep the raw PostgreSQL timestamp, not a JS Date: two rows can fall within
// the same millisecond but still have different positions in the index.
const position = z.object({ at: z.iso.datetime(), id: z.uuid() });
export type ArticleCursor = z.infer<typeof position>;

export function encodeCursor({ at, id }: ArticleCursor): string {
  return Buffer.from(JSON.stringify({ at, id })).toString("base64url");
}

export function decodeCursor(value: string): ArticleCursor | null {
  if (!value || value.length > 256 || !/^[\w-]+$/.test(value)) return null;
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) return null;
    const result = position.safeParse(JSON.parse(bytes.toString("utf8")));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function parsePageParams(params: URLSearchParams) {
  const limit = z.coerce
    .number()
    .int()
    .positive()
    .parse(params.get("limit") ?? 50);
  const cursor = z
    .string()
    .transform((value, ctx) => {
      const decoded = decodeCursor(value);
      if (decoded) return decoded;
      ctx.addIssue({ code: "custom", message: "Invalid cursor" });
      return z.NEVER;
    })
    .optional()
    .parse(params.get("cursor") ?? undefined);
  return { limit: Math.min(100, limit), cursor };
}

export function articlePage<T extends { id: string; cursorAt: string }>(rows: T[], limit: number) {
  const last = rows[limit - 1];
  const nextCursor = rows.length > limit ? encodeCursor({ at: last.cursorAt, id: last.id }) : null;
  return { items: rows.slice(0, limit).map(({ cursorAt: _, ...item }) => item), nextCursor };
}
