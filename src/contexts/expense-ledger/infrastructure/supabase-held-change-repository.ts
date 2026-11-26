import type { ExpenseId, SeatId, TripId } from "@/shared-kernel/ids";
import { type Db, toDate, unwrap, unwrapAll } from "@/platform/supabase/db";
import type { HeldChangeRepository } from "../application/ports";
import { expensePropsFromJson, expensePropsToJson, type HeldChange } from "../domain/held-change";

type Row = {
  id: string;
  trip_id: string;
  expense_id: string;
  kind: string;
  proposed: unknown;
  base_version: number | null;
  by_seat: string;
  created_at: string;
};

const toChange = (r: Row): HeldChange => ({
  id: r.id,
  tripId: r.trip_id as TripId,
  expenseId: r.expense_id as ExpenseId,
  kind: r.kind as HeldChange["kind"],
  proposed: expensePropsFromJson(r.proposed),
  baseVersion: r.base_version,
  by: r.by_seat as SeatId,
  at: toDate(r.created_at),
});

export class SupabaseHeldChangeRepository implements HeldChangeRepository {
  constructor(private readonly db: Db) {}

  async add(c: HeldChange) {
    unwrap(
      await this.db.from("held_changes").insert({
        id: c.id,
        trip_id: c.tripId,
        expense_id: c.expenseId,
        kind: c.kind,
        proposed: expensePropsToJson(c.proposed) as never,
        base_version: c.baseVersion,
        by_seat: c.by,
        created_at: c.at.toISOString(),
      }),
      "hold change",
    );
  }

  async get(tripId: TripId, id: string) {
    const rows = unwrapAll(await this.db.from("held_changes").select("*").eq("trip_id", tripId).eq("id", id), "get held change");
    return rows[0] ? toChange(rows[0] as Row) : null;
  }

  async list(tripId: TripId) {
    const rows = unwrapAll(
      await this.db.from("held_changes").select("*").eq("trip_id", tripId).order("created_at"),
      "list held changes",
    );
    return rows.map((r) => toChange(r as Row));
  }

  async delete(tripId: TripId, id: string) {
    unwrap(await this.db.from("held_changes").delete().eq("trip_id", tripId).eq("id", id), "delete held change");
  }
}
