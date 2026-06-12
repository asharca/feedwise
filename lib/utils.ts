import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Route a remote image through /api/image-proxy. Pass `width` for anything
 * rendered as a thumbnail — the proxy downscales server-side (96 icons,
 * 480 grid cards, 1280 hero) so mobile browsers never decode full-size
 * originals. Omit it only where the image is shown at full size.
 */
export function proxyImg(
  url: string | null | undefined,
  width?: 96 | 480 | 1280,
): string | undefined {
  if (!url) return undefined;
  const w = width ? `&w=${width}` : "";
  return `/api/image-proxy?url=${encodeURIComponent(url)}${w}`;
}
