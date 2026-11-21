import { z } from "zod";

const payload = z.object({
  code: z.literal(200),
  data: z.array(
    z.object({
      title: z.string().trim().min(1),
      url: z.string().nullish(),
      mobileUrl: z.string().nullish(),
      cover: z.string().nullish(),
      desc: z.string().nullish(),
      hot: z.number().finite().nullish(),
    }),
  ),
});

export type ProviderEntry = z.infer<typeof payload>["data"][number];

export const dailyhot = {
  path: (key: string) => `/${encodeURIComponent(key)}`,
  entries: (input: unknown) => payload.parse(input).data,
};
