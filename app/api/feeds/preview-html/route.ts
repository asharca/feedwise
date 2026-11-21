import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { classifyError, humanMessage } from "@/lib/feeds/feed-error";
import { htmlConfigSchema } from "@/lib/feeds/source-config";
import { previewHtmlSource } from "@/lib/feeds/html-source";

const schema = z.object({ url: z.string().url(), config: htmlConfigSchema });

export const POST = withAuth(async (req) => {
  const { url, config } = schema.parse(await req.json());
  try {
    const { title, articles } = await previewHtmlSource(url, config);
    const items = articles.map(({ title, url, summary, publishedAt, imageUrl }) => ({
      title,
      url,
      summary,
      publishedAt,
      imageUrl,
    }));
    return Response.json({ success: true, data: { title, items } });
  } catch (cause) {
    const err = classifyError(cause);
    return Response.json(
      {
        success: false,
        error: err.code === "parse" ? err.message : humanMessage(err.code, err.httpStatus),
      },
      { status: 400 },
    );
  }
});
