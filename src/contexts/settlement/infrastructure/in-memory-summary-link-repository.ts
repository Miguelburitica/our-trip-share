import type { TripId } from "@/shared-kernel/ids";
import type { SummaryLinkRepository } from "../application/ports";

export class InMemorySummaryLinkRepository implements SummaryLinkRepository {
  private rows = new Map<TripId, string>();

  async get(tripId: TripId) {
    return this.rows.get(tripId) ?? null;
  }

  async tripOf(token: string) {
    for (const [tripId, t] of this.rows) if (t === token) return tripId;
    return null;
  }

  async set(tripId: TripId, token: string | null) {
    if (token) this.rows.set(tripId, token);
    else this.rows.delete(tripId);
  }
}
