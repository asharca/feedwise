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

// zod-to-json-schema's types target Zod 3; Zod 4's schema is still
// structurally compatible at runtime, so cast away the surface mismatch.
export const clusterResponseJsonSchema = zodToJsonSchema(
  ClusterResponseSchema as unknown as Parameters<typeof zodToJsonSchema>[0],
  { name: "ClusterResponse", target: "openApi3" },
);
