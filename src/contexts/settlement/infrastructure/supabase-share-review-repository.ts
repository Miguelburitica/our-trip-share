import type { SeatId, TripId } from "@/shared-kernel/ids";
import { type Db, toDate, unwrap, unwrapAll } from "@/platform/supabase/db";
import type { ShareReviewRepository } from "../application/ports";
import type { ShareReview, ShareReviewStatus } from "../domain/share-review";

type Row = { trip_id: string; seat_id: string; status: string; note: string | null; updated_at: string };

const toReview = (r: Row): ShareReview => ({
  tripId: r.trip_id as TripId,
  seatId: r.seat_id as SeatId,
  status: r.status as ShareReviewStatus,
  note: r.note,
  updatedAt: toDate(r.updated_at),
});

export class SupabaseShareReviewRepository implements ShareReviewRepository {
  constructor(private readonly db: Db) {}

  async get(tripId: TripId, seatId: SeatId) {
    const rows = unwrapAll(
      await this.db.from("share_reviews").select("*").eq("trip_id", tripId).eq("seat_id", seatId),
      "get share review",
    );
    return rows[0] ? toReview(rows[0]) : null;
  }

  async list(tripId: TripId) {
    const rows = unwrapAll(await this.db.from("share_reviews").select("*").eq("trip_id", tripId), "list share reviews");
    return rows.map(toReview);
  }

  async set(r: ShareReview) {
    unwrap(
      await this.db.from("share_reviews").upsert({
        trip_id: r.tripId,
        seat_id: r.seatId,
        status: r.status,
        note: r.note,
        updated_at: r.updatedAt.toISOString(),
      }),
      "save share review",
    );
  }
}
