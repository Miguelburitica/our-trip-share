import type { SeatId, TripId } from "@/shared-kernel/ids";
import type { ShareReviewRepository } from "../application/ports";
import type { ShareReview } from "../domain/share-review";

export class InMemoryShareReviewRepository implements ShareReviewRepository {
  private rows = new Map<string, ShareReview>();

  async get(tripId: TripId, seatId: SeatId) {
    const r = this.rows.get(`${tripId}:${seatId}`);
    return r ? structuredClone(r) : null;
  }

  async list(tripId: TripId) {
    return [...this.rows.values()].filter((r) => r.tripId === tripId).map((r) => structuredClone(r));
  }

  async set(review: ShareReview) {
    this.rows.set(`${review.tripId}:${review.seatId}`, structuredClone(review));
  }
}
