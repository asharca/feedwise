import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  pickWidthTier,
  shouldBypassResize,
  resizeImage,
} from "@/lib/images/resize-image";

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 80, b: 40 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe("pickWidthTier", () => {
  it("accepts exactly the allowed tiers", () => {
    expect(pickWidthTier("96")).toBe(96);
    expect(pickWidthTier("480")).toBe(480);
    expect(pickWidthTier("1280")).toBe(1280);
  });

  it("rejects missing, non-numeric, and off-tier values", () => {
    expect(pickWidthTier(null)).toBeNull();
    expect(pickWidthTier("")).toBeNull();
    expect(pickWidthTier("300")).toBeNull();
    expect(pickWidthTier("-1")).toBeNull();
    expect(pickWidthTier("abc")).toBeNull();
  });
});

describe("shouldBypassResize", () => {
  it("bypasses vector and animated formats", () => {
    expect(shouldBypassResize("image/svg+xml")).toBe(true);
    expect(shouldBypassResize("image/gif")).toBe(true);
  });

  it("resizes common raster formats", () => {
    expect(shouldBypassResize("image/jpeg")).toBe(false);
    expect(shouldBypassResize("image/png")).toBe(false);
    expect(shouldBypassResize("image/webp")).toBe(false);
  });
});

describe("resizeImage", () => {
  it("downscales a large jpeg to the tier width and re-encodes as webp", async () => {
    const big = await makeJpeg(2000, 1200);
    const out = await resizeImage(big, "image/jpeg", 480);
    expect(out.contentType).toBe("image/webp");
    const meta = await sharp(out.body).metadata();
    expect(meta.width).toBe(480);
    expect(meta.format).toBe("webp");
    expect(out.body.length).toBeLessThan(big.length);
  });

  it("never enlarges a smaller source", async () => {
    const small = await makeJpeg(100, 50);
    const out = await resizeImage(small, "image/jpeg", 480);
    const meta = await sharp(out.body).metadata();
    expect(meta.width).toBe(100);
  });

  it("passes gif through untouched", async () => {
    const fake = Buffer.from("GIF89a-not-really");
    const out = await resizeImage(fake, "image/gif", 480);
    expect(out.body).toBe(fake);
    expect(out.contentType).toBe("image/gif");
  });

  it("falls back to original bytes when the source cannot be decoded", async () => {
    const corrupt = Buffer.from("definitely not an image");
    const out = await resizeImage(corrupt, "image/jpeg", 480);
    expect(out.body).toBe(corrupt);
    expect(out.contentType).toBe("image/jpeg");
  });
});
