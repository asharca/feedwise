import * as queries from "@/lib/db/queries/mcp";
import { computeHotTrending, getHotBoards } from "@/lib/hot/boards";
import { createToolServer } from "./tools";

export function createMcpServer(userId: string) {
  return createToolServer(userId, {
    ...queries,
    hotBoards: getHotBoards,
    hotTrending: async () => computeHotTrending(await getHotBoards()),
  });
}
