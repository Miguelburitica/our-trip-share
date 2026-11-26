import type { Db } from "@/platform/supabase/db";
import type { TripId } from "@/shared-kernel/ids";
import type { ReceiptStore } from "../application/ports";
import type { ReceiptImage } from "../domain/receipt";

const BUCKET = "receipts";
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

/** Private Supabase Storage bucket; only the server (service role) reads and writes it. */
export class SupabaseReceiptStore implements ReceiptStore {
  constructor(private readonly db: Db) {}

  async put(tripId: TripId, id: string, image: ReceiptImage) {
    const path = `${tripId}/${id}.${EXT[image.mediaType]}`;
    const { error } = await this.db.storage.from(BUCKET).upload(path, image.bytes, { contentType: image.mediaType });
    if (error) throw new Error(`upload receipt: ${error.message}`);
    return path;
  }

  async signedUrl(path: string) {
    const { data, error } = await this.db.storage.from(BUCKET).createSignedUrl(path, 300);
    return error ? null : data.signedUrl;
  }
}
