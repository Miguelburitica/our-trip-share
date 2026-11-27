import sharp from "sharp";
import type { ReceiptCompressor } from "../application/ports";
import type { ReceiptImage } from "../domain/receipt";

/**
 * Stored receipts: WebP, at most 1000px on the long side. A phone photo (3–12 MB) ends up around
 * 20–60 KB and every line stays readable; at 600px the items blur and only totals survive.
 */
export const RECEIPT_MAX_PX = 1000;
const QUALITY = 60;

export class SharpReceiptCompressor implements ReceiptCompressor {
  async forStorage(image: ReceiptImage): Promise<ReceiptImage> {
    const bytes = await sharp(image.bytes)
      .rotate() // applies EXIF orientation before the metadata is dropped
      .resize(RECEIPT_MAX_PX, RECEIPT_MAX_PX, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();
    // Never keep a bigger file than the one uploaded (tiny or already-optimized images).
    if (bytes.byteLength >= image.bytes.byteLength) return image;
    return { bytes: new Uint8Array(bytes), mediaType: "image/webp" };
  }
}
