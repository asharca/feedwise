import { handleReader } from "@/lib/client-api/greader/router";

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return handleReader(req, (await ctx.params).path.join("/"));
}

export const POST = GET;
