import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { RECEIPT_MAX_PX, SharpReceiptCompressor } from "./sharp-receipt-compressor";

const photo = async (width: number, height: number) => {
  const noise = { type: "gaussian" as const, mean: 200, sigma: 30 };
  const bytes = await sharp({ create: { width, height, channels: 3, background: "#fff", noise } }).jpeg({ quality: 90 }).toBuffer();
  return { bytes: new Uint8Array(bytes), mediaType: "image/jpeg" as const };
};

describe("Stored receipt copies", () => {
  const compressor = new SharpReceiptCompressor();

  it("keeps a small WebP, at most 1000px on the long side, with the same proportions", async () => {
    const original = await photo(1200, 1600);
    const kept = await compressor.forStorage(original);
    expect(kept.mediaType).toBe("image/webp");
    expect(kept.bytes.byteLength).toBeLessThan(original.bytes.byteLength / 2);
    const meta = await sharp(kept.bytes).metadata();
    expect([meta.width, meta.height]).toEqual([750, RECEIPT_MAX_PX]);
  });

  it("never enlarges a small photo nor keeps a heavier file than the one uploaded", async () => {
    const tiny = { bytes: new Uint8Array(await sharp({ create: { width: 40, height: 40, channels: 3, background: "#fff" } }).webp().toBuffer()), mediaType: "image/webp" as const };
    expect(await compressor.forStorage(tiny)).toBe(tiny);
  });
});
