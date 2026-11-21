import type { ArticleListItem } from "@/lib/reader/types";

/**
 * Shared Article shape used by the search view and the default reader.
 * Matches the cursor-paginated `/api/articles` item DTO.
 */
export type Article = ArticleListItem;
