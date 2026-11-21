import {
  clientFeeds,
  clientFolders,
  clientTags,
  readerIdentity,
  unreadCounts,
} from "@/lib/db/queries/client-api";
import { actionToken, tokenHash, validActionToken } from "../credentials";
import { InvalidInput, json, privateHeaders, requestParams, text } from "../http";
import { LABEL, READING_LIST, STATE } from "./protocol";
import { subscription } from "./present";
import { mutate } from "./mutations";
import { streamResponse } from "./streams";

const writes: Record<string, true> = {
  "subscription/edit": true,
  "subscription/quickadd": true,
  "subscription/quick-add": true,
  "edit-tag": true,
  "mark-all-as-read": true,
};

export async function handleReader(req: Request, path: string) {
  try {
    const auth = /^GoogleLogin\s+auth=([0-9a-f]{64})$/i.exec(
      req.headers.get("authorization") ?? "",
    );
    const user = auth && (await readerIdentity(tokenHash(auth[1])));
    if (!user)
      return new Response("Unauthorized", {
        status: 401,
        headers: { ...privateHeaders, "Google-Bad-Token": "true" },
      });
    const p = await requestParams(req);
    if (Object.hasOwn(writes, path)) {
      if (req.method !== "POST")
        return new Response("POST required", { status: 405, headers: { Allow: "POST" } });
      const token = p.get("T");
      if (token !== null && !validActionToken(token, actionToken(user.id, user.credentialHash)))
        return text("Invalid action token", 403);
      return await mutate(user.id, path, p);
    }
    switch (path) {
      case "token":
        return text(actionToken(user.id, user.credentialHash));
      case "user-info":
        return json({
          userId: user.id,
          userProfileId: user.id,
          userName: user.name ?? user.email,
          userEmail: user.email,
        });
      case "subscription/list":
        return json({ subscriptions: (await clientFeeds(user.id)).map(subscription) });
      case "tag/list": {
        const [folders, tags] = await Promise.all([clientFolders(user.id), clientTags(user.id)]);
        const labels = new Set([...folders, ...tags].map(({ name }) => name));
        return json({
          tags: [
            READING_LIST,
            STATE + "read",
            STATE + "starred",
            ...[...labels].map((name) => LABEL + name),
          ].map((id) => ({ id })),
        });
      }
      case "unread-count": {
        const counts = await unreadCounts(user.id);
        if (!counts.some((v) => v.id === READING_LIST))
          counts.push({ id: READING_LIST, count: 0, newestItemTimestampUsec: "0" });
        return json({
          max: counts.find((v) => v.id === READING_LIST)!.count,
          unreadcounts: counts,
        });
      }
      default:
        return path.startsWith("stream/")
          ? await streamResponse(user.id, path, p)
          : text("Unknown endpoint", 404);
    }
  } catch (error) {
    return error instanceof InvalidInput ? text(error.message, 400) : text("Internal error", 500);
  }
}
