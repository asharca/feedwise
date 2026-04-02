import { headers } from "next/headers";
import { getAuth } from "./index";

export async function getSession() {
  return getAuth().api.getSession({ headers: await headers() });
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}
