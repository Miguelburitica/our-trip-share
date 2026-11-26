import type { TripId } from "@/shared-kernel/ids";
import type { ReceiptStore } from "../application/ports";
import type { ReceiptImage } from "../domain/receipt";

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

/** Demo/tests: photos kept in memory and served back as data URLs. */
export class InMemoryReceiptStore implements ReceiptStore {
  private files = new Map<string, ReceiptImage>();

  async put(tripId: TripId, id: string, image: ReceiptImage) {
    const path = `${tripId}/${id}.${EXT[image.mediaType]}`;
    this.files.set(path, image);
    return path;
  }

  async signedUrl(path: string) {
    const f = this.files.get(path);
    return f ? `data:${f.mediaType};base64,${Buffer.from(f.bytes).toString("base64")}` : null;
  }
}
