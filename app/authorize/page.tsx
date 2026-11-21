import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { authorization } from "@/lib/oauth/authorization";
import { getClient } from "@/lib/oauth/store";
import { Consent } from "./consent";

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parsed = authorization.safeParse(await searchParams);
  const client = parsed.success ? await getClient(parsed.data.client_id) : null;
  if (!parsed.success || !client || !client.redirect_uris.includes(parsed.data.redirect_uri)) {
    // Never redirect an invalid request, even to display an error.
    return <main className="p-8">无效的授权请求或未注册的回调地址。</main>;
  }
  if (!(await getSession())) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(parsed.data))
      if (value !== undefined) query.set(key, value);
    redirect(`/login?redirect=${encodeURIComponent(`/authorize?${query}`)}`);
  }
  return <Consent params={parsed.data} clientName={client.client_name} />;
}
