import type { Db } from "@/platform/supabase/db";
import { unwrap, unwrapAll } from "@/platform/supabase/db";
import type { SeatId, TripId } from "@/shared-kernel/ids";
import type { PayoutHandleRepository } from "../application/ports";
import type { PayoutHandle } from "../domain/payout-handles";

export class SupabasePayoutHandleRepository implements PayoutHandleRepository {
  constructor(private readonly db: Db) {}

  async get(tripId: TripId, seatId: SeatId) {
    const rows = unwrapAll(
      await this.db.from("payout_handles").select("handles").eq("trip_id", tripId).eq("seat_id", seatId),
      "get payout handles",
    );
    return (rows[0]?.handles as unknown as PayoutHandle[] | undefined) ?? [];
  }

  async getMany(tripId: TripId, seatIds: readonly SeatId[]) {
    const out = new Map<SeatId, PayoutHandle[]>(seatIds.map((id) => [id, []]));
    if (seatIds.length === 0) return out;
    const rows = unwrapAll(
      await this.db.from("payout_handles").select("seat_id, handles").eq("trip_id", tripId).in("seat_id", [...seatIds]),
      "list payout handles",
    );
    for (const r of rows) out.set(r.seat_id as SeatId, r.handles as unknown as PayoutHandle[]);
    return out;
  }

  async set(tripId: TripId, seatId: SeatId, handles: readonly PayoutHandle[]) {
    unwrap(
      await this.db
        .from("payout_handles")
        .upsert({ trip_id: tripId, seat_id: seatId, handles: [...handles] as never, updated_at: new Date().toISOString() }),
      "save payout handles",
    );
  }
}
