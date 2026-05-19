const STRIP_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "ref",
  "ref_src",
  "mc_cid",
  "mc_eid",
  "yclid",
]);

export function canonicalizeUrl(input: string | null | undefined): string {
  if (input == null) return "";
  const raw = input.trim();
  if (raw === "") return "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  const keep: Array<[string, string]> = [];
  for (const [k, v] of url.searchParams.entries()) {
    if (STRIP_PARAMS.has(k.toLowerCase())) continue;
    if (k.toLowerCase().startsWith("utm_")) continue;
    keep.push([k, v]);
  }
  url.search = "";
  for (const [k, v] of keep) url.searchParams.append(k, v);
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
}
