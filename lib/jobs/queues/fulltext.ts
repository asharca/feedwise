import { getJobQueue } from "@/lib/jobs/queue";

export async function enqueueFullText(articleId: string): Promise<void> {
  await getJobQueue("article.fulltext").add(
    "fetch",
    { articleId },
    {
      jobId: "fulltext-" + articleId,
      attempts: 2,
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
}
