import type { rules } from "@/lib/db/schema";

export function ruleDto({
  id,
  name,
  enabled,
  scope,
  matchMode,
  conditions,
  actions,
  position,
  createdAt,
  updatedAt,
}: typeof rules.$inferSelect) {
  return {
    id,
    name,
    enabled,
    scope,
    matchMode,
    conditions,
    actions,
    position,
    createdAt,
    updatedAt,
  };
}
