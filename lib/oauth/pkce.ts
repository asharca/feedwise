export async function verifyPKCE(
  codeVerifier: string,
  codeChallenge: string,
  method: string,
): Promise<boolean> {
  if (method !== "S256" || !/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)) return false;

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));

  const computed = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return computed === codeChallenge;
}
