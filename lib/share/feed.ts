import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { ShareFeedFilter } from "@/lib/db/schema-types";
import { CONTENT_VIEWS } from "@/lib/db/schema-types";
import { originOf } from "@/lib/client-api/http";

export const shareSchema = z.object({
  name: z.string().trim().min(1).max(100),
  filter: z.strictObject({
    feedId: z.uuid().optional(),
    folderId: z.uuid().optional(),
    tagId: z.uuid().optional(),
    starred: z.boolean().optional(),
    view: z.enum(CONTENT_VIEWS).optional(),
  }),
});

export const newShareToken = () => randomBytes(32).toString("base64url");
export const rssUrl = (req: Request, token: string) => `${originOf(req)}/api/public/rss/${token}`;
export function shareDto(
  req: Request,
  row: { id: string; name: string; filter: ShareFeedFilter; token: string; createdAt: Date },
) {
  return {
    id: row.id,
    name: row.name,
    filter: row.filter,
    createdAt: row.createdAt,
    url: rssUrl(req, row.token),
  };
}
