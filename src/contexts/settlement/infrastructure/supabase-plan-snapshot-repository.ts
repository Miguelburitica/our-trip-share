import type { SeatId, TripId } from "@/shared-kernel/ids";
import { type Db, toDate, unwrap, unwrapAll } from "@/platform/supabase/db";
import type { PlanSnapshotRepository } from "../application/ports";
import type { Transfer } from "../domain/ledger-entry";
import type { PlanSnapshot } from "../domain/plan";

type Row = { frozen_at: string; transfers: unknown; ledger_balances: unknown };

const toSnapshot = (r: Row): PlanSnapshot => ({
  frozenAt: toDate(r.frozen_at),
  transfers: r.transfers as Transfer[],
  ledgerBalances: new Map(Object.entries(r.ledger_balances as Record<string, number>)) as Map<SeatId, number>,
});

export class SupabasePlanSnapshotRepository implements PlanSnapshotRepository {
  constructor(private readonly db: Db) {}

  async get(tripId: TripId) {
    const rows = unwrapAll(
      await this.db.from("plan_snapshots").select("frozen_at, transfers, ledger_balances").eq("trip_id", tripId),
      "get plan snapshot",
    );
    return rows[0] ? toSnapshot(rows[0]) : null;
  }

  /** The first freeze wins: a concurrent second one keeps the stored plan. */
  async saveIfAbsent(tripId: TripId, s: PlanSnapshot) {
    unwrap(
      await this.db.from("plan_snapshots").upsert(
        {
          trip_id: tripId,
          frozen_at: s.frozenAt.toISOString(),
          transfers: s.transfers.map((t) => ({ from: t.from, to: t.to, amount: t.amount })),
          ledger_balances: Object.fromEntries(s.ledgerBalances),
        },
        { onConflict: "trip_id", ignoreDuplicates: true },
      ),
      "save plan snapshot",
    );
    return (await this.get(tripId))!;
  }
}
