import type { SeatId, SplitGroupId, TripId } from "@/shared-kernel/ids";
import { type Db, type Row, toDate, unwrap, unwrapAll } from "@/platform/supabase/db";
import type { SplitGroupRepository } from "../application/ports";
import { SplitGroup } from "../domain/split-group";

const toGroup = (r: Row<"split_groups">) =>
  SplitGroup.fromPrimitives({
    id: r.id as SplitGroupId,
    tripId: r.trip_id as TripId,
    name: r.name,
    seatIds: r.seat_ids as SeatId[],
    createdBy: r.created_by as SeatId,
    createdAt: toDate(r.created_at),
  });

export class SupabaseSplitGroupRepository implements SplitGroupRepository {
  constructor(private readonly db: Db) {}

  async listByTrip(tripId: TripId) {
    const rows = unwrapAll(
      await this.db.from("split_groups").select("*").eq("trip_id", tripId).order("created_at"),
      "list split groups",
    );
    return rows.map(toGroup);
  }

  async add(group: SplitGroup) {
    const g = group.toPrimitives();
    unwrap(
      await this.db.from("split_groups").insert({
        id: g.id,
        trip_id: g.tripId,
        name: g.name,
        seat_ids: g.seatIds,
        created_by: g.createdBy,
        created_at: g.createdAt.toISOString(),
      }),
      "add split group",
    );
  }

  async delete(tripId: TripId, id: SplitGroupId) {
    unwrap(await this.db.from("split_groups").delete().eq("trip_id", tripId).eq("id", id), "delete split group");
  }
}
