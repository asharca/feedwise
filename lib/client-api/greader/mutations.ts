import { changeItems, editClientFeed, type ItemChange } from "@/lib/db/queries/client-api";
import { assertFetchableUrl } from "@/lib/net/safe-fetch";
import { integer, InvalidInput, json, text } from "../http";
import { parseStream } from "./protocol";
import { requestedIds } from "./streams";

function label(value: string | null) {
  if (value === null) return undefined;
  const parsed = parseStream(value);
  if (parsed.kind !== "label" || parsed.value.length > 255)
    throw new InvalidInput("Invalid folder label");
  return parsed.value;
}

async function editSubscriptions(userId: string, p: URLSearchParams, quick: boolean) {
  const action = quick ? "subscribe" : p.get("ac");
  if (action !== "subscribe" && action !== "edit" && action !== "unsubscribe")
    throw new InvalidInput("Unknown subscription action");
  const targets = quick ? [p.get("quickadd") ?? ""] : p.getAll("s");
  if (!targets.length) throw new InvalidInput("Missing subscription");
  const add = label(p.get("a")),
    remove = label(p.get("r"));
  const titles = p.getAll("t");
  for (const [index, raw] of targets.entries()) {
    const target = raw.replace(/^feed\//, "");
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(target)) {
      try {
        assertFetchableUrl(target);
      } catch {
        throw new InvalidInput("Invalid feed URL");
      }
    }
    const title = titles[index] ?? titles[0];
    if (title && title.length > 500) throw new InvalidInput("Title too long");
    const result = await editClientFeed(userId, { action, target, add, remove, title });
    if (!result) return text("Subscription not found", 404);
    // New feeds have next_fetch_at NULL: the normal scheduler fetches them.
    if (quick)
      return json({
        numResults: 1,
        query: result.url,
        streamId: `feed/${result.id}`,
        streamName: result.title ?? result.url,
      });
  }
  return text("OK");
}

export async function mutate(userId: string, path: string, p: URLSearchParams) {
  if (path.startsWith("subscription/"))
    return editSubscriptions(userId, p, path !== "subscription/edit");
  if (path === "mark-all-as-read") {
    const streams = p.getAll("s").map(parseStream);
    if (!streams.length) throw new InvalidInput("Missing stream");
    await changeItems(
      userId,
      { streams, maxCrawlUsec: p.has("ts") ? integer(p.get("ts")) : undefined },
      [{ kind: "read", enabled: true }],
    );
  } else {
    const ids = requestedIds(p);
    if (!ids.length) throw new InvalidInput("Missing item id");
    const changes: ItemChange[] = [];
    for (const key of ["a", "r"]) {
      for (const raw of p.getAll(key)) {
        const stream = parseStream(raw),
          enabled = key === "a";
        if (stream.kind === "read" || stream.kind === "starred")
          changes.push({ kind: stream.kind, enabled });
        else if (stream.kind === "label" && stream.value.length <= 100)
          changes.push({ kind: "label", name: stream.value, enabled });
        else throw new InvalidInput("Invalid item tag");
      }
    }
    if (!changes.length) throw new InvalidInput("Missing item tag");
    await changeItems(userId, { ids }, changes);
  }
  return text("OK");
}
