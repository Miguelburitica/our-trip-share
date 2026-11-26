import type { ExpenseId, NoticeId, SeatId, TripId } from "@/shared-kernel/ids";
import { type Db, type Row, toDate, toDateOrNull, unwrap, unwrapAll } from "@/platform/supabase/db";
import type { BalanceNoticeRepository } from "../application/ports";
import { BalanceNotice, type BalanceNoticeProps } from "../domain/balance-notice";

const toNotice = (r: Row<"balance_notices">) =>
  BalanceNotice.fromPrimitives({
    id: r.id as NoticeId,
    tripId: r.trip_id as TripId,
    seatId: r.seat_id as SeatId,
    delta: r.delta,
    cause: {
      kind: r.cause_kind as BalanceNoticeProps["cause"]["kind"],
      expenseId: r.expense_id as ExpenseId,
      title: r.cause_title,
      category: r.cause_category,
    },
    by: r.by_seat as SeatId,
    createdAt: toDate(r.created_at),
    dismissedAt: toDateOrNull(r.dismissed_at),
  });

const toRow = (n: BalanceNotice) => {
  const p = n.toPrimitives();
  return {
    id: p.id,
    trip_id: p.tripId,
    seat_id: p.seatId,
    delta: p.delta,
    expense_id: p.cause.expenseId,
    cause_kind: p.cause.kind,
    cause_title: p.cause.title?.slice(0, 80) ?? null,
    cause_category: p.cause.category,
    by_seat: p.by,
    created_at: p.createdAt.toISOString(),
    dismissed_at: p.dismissedAt?.toISOString() ?? null,
  };
};

export class SupabaseBalanceNoticeRepository implements BalanceNoticeRepository {
  constructor(private readonly db: Db) {}

  async add(notices: readonly BalanceNotice[]) {
    if (notices.length) unwrap(await this.db.from("balance_notices").insert(notices.map(toRow)), "add notices");
  }

  async get(id: NoticeId) {
    const row = unwrap(await this.db.from("balance_notices").select("*").eq("id", id).maybeSingle(), "get notice");
    return row ? toNotice(row) : null;
  }

  async save(notice: BalanceNotice) {
    unwrap(await this.db.from("balance_notices").upsert(toRow(notice)), "save notice");
  }

  async listOpen(tripId: TripId, seatId: SeatId) {
    const rows = unwrapAll(
      await this.db
        .from("balance_notices")
        .select("*")
        .eq("trip_id", tripId)
        .eq("seat_id", seatId)
        .is("dismissed_at", null)
        .order("created_at", { ascending: false }),
      "list notices",
    );
    return rows.map(toNotice);
  }
}
