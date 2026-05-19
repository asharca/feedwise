import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const ClusterSchema = z.object({
  topic: z.string().min(1).max(40),
  headline: z.string().min(1).max(120),
  importance: z.number().int().min(1).max(10),
  articleIds: z.array(z.string().uuid()).min(1),
});

export const ClusterResponseSchema = z.object({
  clusters: z.array(ClusterSchema).max(50),
});

export type Cluster = z.infer<typeof ClusterSchema>;
export type ClusterResponse = z.infer<typeof ClusterResponseSchema>;

export const clusterResponseJsonSchema = zodToJsonSchema(ClusterResponseSchema, {
  name: "ClusterResponse",
  target: "openApi3",
});
