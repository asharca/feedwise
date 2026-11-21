import { loginCredential, issueToken } from "@/lib/db/queries/client-api";
import { newClientToken, tokenHash, verifyPassword } from "../credentials";
import { InvalidInput, requestParams, text } from "../http";
import { clientLoginBody } from "./protocol";

const missingHash = `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`;

export async function clientLogin(req: Request) {
  try {
    const params = await requestParams(req);
    const email = params.get("Email")?.trim().toLowerCase();
    const password = params.get("Passwd");
    if (!email || !password) return text("Error=BadAuthentication", 401);
    const credential = await loginCredential(email);
    if (!(await verifyPassword(password, credential?.hash ?? missingHash)) || !credential)
      return text("Error=BadAuthentication", 401);
    const token = newClientToken();
    const issued = await issueToken(
      credential.userId,
      credential.hash,
      tokenHash(token),
      req.headers.get("user-agent")?.slice(0, 100) ?? null,
    );
    return issued ? text(clientLoginBody(token)) : text("Error=BadAuthentication", 401);
  } catch (error) {
    if (error instanceof InvalidInput) return text(error.message, 400);
    // Never log the request URL, form, or a DB query containing credentials.
    return text("Error=ServiceUnavailable", 503);
  }
}
