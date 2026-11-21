import { clientItems, itemRefs, type ItemFilter } from "@/lib/db/queries/client-api";
import { integer, InvalidInput, json } from "../http";
import { itemSeq, pageBySeq, parseStream, READING_LIST } from "./protocol";
import { readerItem, readerRef } from "./present";

export function requestedIds(p: URLSearchParams) {
  const ids = p.getAll("i");
  if (ids.length > 10000) throw new InvalidInput("Too many item ids");
  return [...new Set(ids.map(itemSeq))];
}

export async function streamResponse(userId: string, path: string, p: URLSearchParams) {
  if (path === "stream/items/contents") {
    const ids = requestedIds(p);
    const rows = await clientItems(userId, { ids }, false, ids.length);
    const byId = new Map(rows.map((row) => [row.seq, row]));
    return json({
      id: READING_LIST,
      updated: Math.floor(Date.now() / 1000),
      items: ids.flatMap((id) => {
        const item = byId.get(id);
        return item ? [readerItem(item)] : [];
      }),
    });
  }
  const idsOnly = path === "stream/items/ids";
  if (!idsOnly && !path.startsWith("stream/contents/"))
    return new Response("Unknown stream endpoint", { status: 404 });
  const streams = idsOnly ? p.getAll("s") : [path.slice("stream/contents/".length)];
  const filter: ItemFilter = {
    streams: streams.map(parseStream),
    exclude: p.getAll("xt").map(parseStream),
  };
  const oldest = p.get("r") === "o";
  if (p.has("ot")) filter.minTime = integer(p.get("ot"));
  if (p.has("nt") && p.get("nt") !== "0") filter.maxTime = integer(p.get("nt"));
  if (p.has("c") && p.get("c") !== "0") filter[oldest ? "after" : "before"] = integer(p.get("c"));
  const limit = Math.min(idsOnly ? 10000 : 1000, Math.max(1, integer(p.get("n") ?? "20")));
  if (idsOnly) {
    const { items, ...cursor } = pageBySeq(
      await itemRefs(userId, filter, oldest, limit + 1),
      limit,
    );
    return json({ itemRefs: items.map(readerRef), ...cursor });
  }
  const { items, ...cursor } = pageBySeq(
    await clientItems(userId, filter, oldest, limit + 1),
    limit,
  );
  return json({
    id: streams[0],
    updated: Math.floor(Date.now() / 1000),
    items: items.map(readerItem),
    ...cursor,
  });
}
