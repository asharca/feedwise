import {
  changeItems,
  clientFeeds,
  clientFolders,
  clientItems,
  feverUser,
  itemCount,
  lastRefresh,
  stateIds,
  type ItemChange,
  type ItemFilter,
} from "@/lib/db/queries/client-api";
import { integer, InvalidInput, json, requestParams } from "../http";
import { feedGroups, feverFeeds, feverItem, feverResponse } from "./present";

async function mark(userId: string, p: URLSearchParams) {
  const id = integer(p.get("id"));
  const as = p.get("as");
  let change: ItemChange;
  let filter: ItemFilter;
  switch (p.get("mark")) {
    case "item":
      if (!id || (as !== "read" && as !== "unread" && as !== "saved" && as !== "unsaved"))
        throw new InvalidInput("Invalid item action");
      filter = { ids: [id] };
      change = {
        kind: as === "read" || as === "unread" ? "read" : "starred",
        enabled: as === "read" || as === "saved",
      };
      break;
    case "feed":
    case "group": {
      // Fever group 0 is the built-in Kindling group (all non-spark feeds).
      if (as !== "read" || (p.get("mark") === "feed" && !id))
        throw new InvalidInput("Invalid mark action");
      filter = p.get("mark") === "feed" ? { feedSeq: id } : id ? { groupSeq: id } : {};
      if (p.has("before")) filter.maxPublished = integer(p.get("before"));
      change = { kind: "read", enabled: true };
      break;
    }
    default:
      throw new InvalidInput("Unknown mark target");
  }
  await changeItems(userId, filter, [change]);
}

async function items(userId: string, p: URLSearchParams) {
  const filter: ItemFilter = {};
  let oldest = true;
  if (p.has("since_id")) filter.after = integer(p.get("since_id"));
  else if (p.has("max_id")) {
    oldest = false;
    filter.before = integer(p.get("max_id")) || undefined;
  } else if (p.has("with_ids")) {
    filter.ids = (p.get("with_ids") || "")
      .split(",")
      .filter(Boolean)
      .slice(0, 50)
      .map((id) => integer(id.trim()));
  }
  const [rows, total] = await Promise.all([
    clientItems(userId, filter, oldest, 50),
    itemCount(userId),
  ]);
  return { items: rows.map(feverItem), total_items: total };
}

export async function handleFever(req: Request) {
  let authenticated = false,
    refreshed = 0;
  try {
    // Fever credentials belong in the POST body, never in a URL/log.
    const p = await requestParams(req, ["api_key"]);
    const key = p.get("api_key");
    const userId = key && /^[a-f\d]{32}$/i.test(key) && (await feverUser(key.toLowerCase()));
    if (!userId) return json(feverResponse(false, 0));
    authenticated = true;
    if (p.has("mark")) await mark(userId, p);
    refreshed = await lastRefresh(userId);
    const fields: Record<string, unknown> = {};
    if (p.has("groups"))
      fields.groups = (await clientFolders(userId)).map((g) => ({ id: g.seq, title: g.name }));
    if (p.has("feeds") || p.has("groups")) {
      const feeds = await clientFeeds(userId);
      fields.feeds_groups = feedGroups(feeds);
      if (p.has("feeds")) fields.feeds = feverFeeds(feeds);
    }
    if (p.has("favicons")) fields.favicons = [];
    if (p.has("items")) Object.assign(fields, await items(userId, p));
    if (p.has("unread_item_ids")) fields.unread_item_ids = await stateIds(userId, "unread");
    if (p.has("saved_item_ids")) fields.saved_item_ids = await stateIds(userId, "starred");
    return json(feverResponse(true, refreshed, fields));
  } catch (error) {
    return json(feverResponse(authenticated, refreshed), error instanceof InvalidInput ? 400 : 500);
  }
}
