import type { SeatId, SettlementId, TripId } from "@/shared-kernel/ids";
import type { CurrencyCode } from "@/shared-kernel/money/currency";
import { type Db, type Row, toDate, toDateOrNull, unwrap, unwrapAll } from "@/platform/supabase/db";
import type { SettlementRepository } from "../application/ports";
import { Settlement, type SettlementMethod, type SettlementProps } from "../domain/settlement";

const toProps = (r: Row<"settlements">): SettlementProps => ({
  id: r.id as SettlementId,
  tripId: r.trip_id as TripId,
  from: r.from_seat as SeatId,
  to: r.to_seat as SeatId,
  amount: r.amount,
  currency: r.currency as CurrencyCode,
  baseAmount: r.base_amount,
  method: r.method as SettlementMethod,
  note: r.note,
  recordedBy: r.recorded_by as SeatId,
  recordedAt: toDate(r.recorded_at),
  status: r.status,
  resolvedAt: toDateOrNull(r.resolved_at),
  resolvedBy: r.resolved_by as SeatId | null,
});

/** Settlements are single-row aggregates: an upsert is atomic on its own. */
export class SupabaseSettlementRepository implements SettlementRepository {
  constructor(private readonly db: Db) {}

  async get(id: SettlementId) {
    const row = unwrap(await this.db.from("settlements").select("*").eq("id", id).maybeSingle(), "get settlement");
    return row ? Settlement.fromPrimitives(toProps(row)) : null;
  }

  async save(settlement: Settlement) {
    const p = settlement.toPrimitives();
    unwrap(
      await this.db.from("settlements").upsert({
        id: p.id,
        trip_id: p.tripId,
        from_seat: p.from,
        to_seat: p.to,
        amount: p.amount,
        currency: p.currency,
        base_amount: p.baseAmount,
        method: p.method,
        note: p.note,
        recorded_by: p.recordedBy,
        recorded_at: p.recordedAt.toISOString(),
        status: p.status,
        resolved_at: p.resolvedAt?.toISOString() ?? null,
        resolved_by: p.resolvedBy,
      }),
      "save settlement",
    );
  }

  async listByTrip(tripId: TripId) {
    const rows = unwrapAll(
      await this.db.from("settlements").select("*").eq("trip_id", tripId).order("recorded_at"),
      "list settlements",
    );
    return rows.map((r) => Settlement.fromPrimitives(toProps(r)));
  }

  async hasSettlements(tripId: TripId) {
    const res = await this.db.from("settlements").select("id", { count: "exact", head: true }).eq("trip_id", tripId);
    if (res.error) unwrap(res, "has settlements");
    return (res.count ?? 0) > 0;
  }

  async isSeatUsed(tripId: TripId, seatId: SeatId) {
    const res = await this.db
      .from("settlements")
      .select("id", { count: "exact", head: true })
      .eq("trip_id", tripId)
      .or(`from_seat.eq.${seatId},to_seat.eq.${seatId},recorded_by.eq.${seatId}`);
    if (res.error) unwrap(res, "seat usage");
    return (res.count ?? 0) > 0;
  }
}
