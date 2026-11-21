import { integer, InvalidInput } from "../http";

const ITEM = "tag:google.com,2005:reader/item/";
export const STATE = "user/-/state/com.google/";
export const LABEL = "user/-/label/";
export const READING_LIST = `${STATE}reading-list`;

export function itemSeq(value: string) {
  const hex = value.startsWith(ITEM) ? value.slice(ITEM.length) : null;
  if (hex !== null && !/^[a-f\d]{16}$/i.test(hex)) throw new InvalidInput("Invalid long item id");
  const seq = hex === null ? integer(value) : parseInt(hex, 16);
  if (!Number.isSafeInteger(seq) || seq < 1) throw new InvalidInput("Invalid item id");
  return seq;
}

export function itemId(seq: number) {
  if (!Number.isSafeInteger(seq) || seq < 1) throw new InvalidInput("Invalid item id");
  return ITEM + seq.toString(16).padStart(16, "0");
}

export type Stream =
  | { kind: "feed" | "label"; value: string }
  | { kind: "reading-list" | "read" | "unread" | "starred" };

export function parseStream(value: string): Stream {
  if (value.startsWith("feed/") && value.length > 5) return { kind: "feed", value: value.slice(5) };
  const path = value.replace(/^user\/[^/]+\//, "");
  if (path.startsWith("label/") && path.length > 6) return { kind: "label", value: path.slice(6) };
  const state = path.replace(/^state\/com\.google\//, "");
  if (state === "reading-list" || state === "read" || state === "starred" || state === "unread")
    return { kind: state };
  throw new InvalidInput("Unknown stream");
}

export function pageBySeq<T extends { seq: number }>(rows: T[], limit: number) {
  return rows.length > limit
    ? { items: rows.slice(0, limit), continuation: String(rows[limit - 1].seq) }
    : { items: rows };
}

export function clientLoginBody(token: string) {
  return `SID=${token}\nLSID=null\nAuth=${token}\n`;
}
