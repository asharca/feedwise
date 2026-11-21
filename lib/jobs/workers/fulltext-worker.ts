import { Worker } from "bullmq";
import { getConnection } from "@/lib/jobs/queue";
import { fetchFullText } from "@/lib/articles/fulltext";

export function startFullTextWorker(): Worker {
  const worker = new Worker(
    "article.fulltext",
    async (job) => {
      const result = await fetchFullText(job.data.articleId);
      if (result?.status === "failed") throw new Error("无法获取文章全文");
    },
    { concurrency: 3, connection: getConnection() },
  );
  worker.on("failed", (job, err) => console.error("[fulltext-worker]", job?.id, err.message));
  return worker;
}
