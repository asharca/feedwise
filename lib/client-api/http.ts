export class InvalidInput extends Error {}

export async function requestParams(request: Request, formOnly: readonly string[] = []) {
  const params = new URLSearchParams(new URL(request.url).search);
  for (const name of formOnly) params.delete(name);
  if (request.method !== "POST" || !request.body) return params;
  const type = request.headers.get("content-type") ?? "";
  let form: FormData | URLSearchParams;
  if (type.startsWith("multipart/form-data")) {
    try {
      form = await request.formData();
    } catch {
      throw new InvalidInput("Invalid form");
    }
  } else {
    form = new URLSearchParams(await request.text());
  }
  // Form values take precedence, without losing repeated fields (i, s, a, r).
  for (const name of new Set(form.keys())) params.delete(name);
  for (const [name, value] of form) if (typeof value === "string") params.append(name, value);
  return params;
}

export function integer(value: string | null): number {
  if (value === null || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new InvalidInput("Invalid integer");
  }
  return Number(value);
}

export const originOf = (request: Request) =>
  new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin;
export const privateHeaders = { "Cache-Control": "private, no-store" };
export const text = (value: string, status = 200) =>
  new Response(value, { status, headers: privateHeaders });
export const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: privateHeaders });
