import sharp from "sharp";

/**
 * Allowed thumbnail widths for the image proxy's `w` param. A fixed allowlist
 * (rather than a free-form number) keeps the CDN/browser cache keyed to three
 * variants per image and blocks resize-amplification abuse.
 *
 *  - 96   → feed icons and tiny row thumbnails (≤48 CSS px @2x)
 *  - 480  → grid card thumbnails (≤240 CSS px @2x)
 *  - 1280 → full-width hero images on mobile (@2x)
 */
export const WIDTH_TIERS = [96, 480, 1280] as const;
export type WidthTier = (typeof WIDTH_TIERS)[number];

/** Parse a raw `w` query value; anything off the allowlist means "no resize". */
export function pickWidthTier(raw: string | null): WidthTier | null {
  if (!raw) return null;
  const n = Number(raw);
  return (WIDTH_TIERS as readonly number[]).includes(n) ? (n as WidthTier) : null;
}

/** Vector and (possibly animated) GIF sources lose semantics when rasterized — pass through. */
export function shouldBypassResize(contentType: string): boolean {
  return contentType.includes("svg") || contentType.includes("gif");
}

export interface ResizedImage {
  body: Buffer;
  contentType: string;
}

/**
 * Downscale to at most `width` (never enlarging) and re-encode as WebP.
 * `.rotate()` bakes EXIF orientation into the pixels since re-encoding strips
 * the metadata. Any decode/encode failure falls back to the original bytes so
 * exotic or corrupt images still render via passthrough.
 */
export async function resizeImage(
  body: Buffer,
  contentType: string,
  width: WidthTier,
): Promise<ResizedImage> {
  if (shouldBypassResize(contentType)) return { body, contentType };
  try {
    const resized = await sharp(body)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    return { body: resized, contentType: "image/webp" };
  } catch {
    return { body, contentType };
  }
}
