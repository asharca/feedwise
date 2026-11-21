/**
 * Client-side fetch for the app's own JSON API. Every route answers with the
 * `{ success: true, data }` / `{ success: false, error }` envelope; this
 * unwraps `data` or throws an ApiError carrying the server's message.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** Extra fields from the error envelope (e.g. `errorCode`). */
    public readonly body: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiRequestInit extends Omit<RequestInit, "body"> {
  /** Serialized as JSON with a matching Content-Type. */
  json?: unknown;
  body?: BodyInit;
}

export async function apiFetch<T>(input: string, init: ApiRequestInit = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const response = await fetch(input, {
    ...rest,
    headers: json === undefined ? headers : { "Content-Type": "application/json", ...headers },
    body: json === undefined ? rest.body : JSON.stringify(json),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON body: fall through to the status check.
  }
  const envelope =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;

  if (!response.ok || envelope?.success === false) {
    const message =
      typeof envelope?.error === "string" ? envelope.error : `请求失败（HTTP ${response.status}）`;
    throw new ApiError(message, response.status, envelope);
  }
  return envelope?.data as T;
}
