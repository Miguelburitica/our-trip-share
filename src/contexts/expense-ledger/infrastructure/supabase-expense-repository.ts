import type { ExpenseId, SeatId, TripId } from "@/shared-kernel/ids";
import type { CurrencyCode } from "@/shared-kernel/money/currency";
import { FxRate } from "@/shared-kernel/money/fx-rate";
import { type Db, type Row, toDate, unwrap, unwrapAll } from "@/platform/supabase/db";
import type { ExpenseRepository } from "../application/ports";
import { Expense, type Category, type ExpenseProps } from "../domain/expense";
import type { FxSource, MoneyBlockProps, Portion } from "../domain/money-block";

type PortionRow = { seat_id: string; amount: number; base_amount: number | null; position: number };
type ExpenseRow = Omit<Row<"expenses">, "fx_rate"> & {
  fx_rate: string | null;
  trip: { base_currency: string };
  payers: PortionRow[];
  shares: PortionRow[];
  changes: Row<"expense_changes">[];
};

// fx_rate is numeric(30,12): read it as text so no float ever touches it.
const SELECT =
  "*, fx_rate:fx_rate::text, trip:trips(base_currency), payers:expense_payers(seat_id, amount, base_amount, position)," +
  " shares:expense_shares(seat_id, amount, base_amount, position), changes:expense_changes(*)";

const portions = (rows: PortionRow[]): Portion[] =>
  [...rows]
    .sort((a, b) => a.position - b.position)
    .map((r) => ({ seatId: r.seat_id as SeatId, amount: r.amount, baseAmount: r.base_amount }));

function toProps(r: ExpenseRow): ExpenseProps {
  const money: MoneyBlockProps | null =
    r.status === "draft" || r.amount === null || r.currency === null || r.split_method === null
      ? null
      : {
          currency: r.currency as CurrencyCode,
          baseCurrency: r.trip.base_currency as CurrencyCode,
          amount: r.amount,
          fxRate: r.fx_rate === null ? null : FxRate.parse(r.fx_rate).toString(),
          fxSource: r.fx_source as FxSource | null,
          baseAmount: r.base_amount,
          splitMethod: r.split_method,
          payers: portions(r.payers),
          shares: portions(r.shares),
        };
  return {
    id: r.id as ExpenseId,
    tripId: r.trip_id as TripId,
    type: r.type,
    status: r.status,
    category: r.category as Category,
    title: r.title,
    notes: r.notes,
    occurredAt: toDate(r.occurred_at),
    money,
    moneyVersion: r.money_version,
    receiptPaths: r.receipt_paths,
    createdBy: r.created_by as SeatId,
    createdAt: toDate(r.created_at),
    updatedAt: toDate(r.updated_at),
    history: [...r.changes]
      .sort((a, b) => a.id - b.id)
      .map((c) => ({
        at: toDate(c.at),
        by: c.by_seat as SeatId,
        kind: c.kind as ExpenseProps["history"][number]["kind"],
        moneyVersion: c.money_version,
        ...(c.summary ? { summary: c.summary } : {}),
      })),
  };
}

function toRow(p: ExpenseProps, newChanges: ExpenseProps["history"]) {
  const m = p.money;
  const portion = (x: Portion) => ({ seat_id: x.seatId, amount: x.amount, base_amount: x.baseAmount });
  return {
    id: p.id,
    trip_id: p.tripId,
    type: p.type,
    status: p.status,
    category: p.category,
    title: p.title,
    notes: p.notes,
    occurred_at: p.occurredAt.toISOString(),
    currency: m?.currency ?? null,
    amount: m?.amount ?? null,
    fx_rate: m?.fxRate ?? null,
    fx_source: m?.fxSource ?? null,
    base_amount: m?.baseAmount ?? null,
    split_method: m?.splitMethod ?? null,
    money_version: p.moneyVersion,
    receipt_paths: p.receiptPaths,
    created_by: p.createdBy,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
    payers: m?.payers.map(portion) ?? [],
    shares: m?.shares.map(portion) ?? [],
    changes: newChanges.map((c) => ({
      at: c.at.toISOString(),
      by_seat: c.by,
      kind: c.kind,
      money_version: c.moneyVersion,
      summary: c.summary ?? null,
    })),
  };
}

/** Expense aggregates in Postgres, written atomically by save_expense (version check + deferred sum checks). */
export class SupabaseExpenseRepository implements ExpenseRepository {
  /** How much history each loaded aggregate already has in the database. */
  private persistedHistory = new WeakMap<Expense, number>();

  constructor(private readonly db: Db) {}

  private hydrate(row: ExpenseRow): Expense {
    const expense = Expense.fromPrimitives(toProps(row));
    this.persistedHistory.set(expense, row.changes.length);
    return expense;
  }

  async get(id: ExpenseId) {
    const row = unwrap(await this.db.from("expenses").select(SELECT).eq("id", id).maybeSingle(), "get expense");
    return row ? this.hydrate(row as unknown as ExpenseRow) : null;
  }

  async save(expense: Expense, expectedMoneyVersion: number | null) {
    const props = expense.toPrimitives();
    const persisted = this.persistedHistory.get(expense) ?? 0;
    unwrap(
      await this.db.rpc("save_expense", {
        p_expense: toRow(props, props.history.slice(persisted)),
        p_expected_version: expectedMoneyVersion as number,
      }),
      "save expense",
    );
    this.persistedHistory.set(expense, props.history.length);
  }

  async recordedBetween(from: Date, to: Date) {
    const rows = unwrapAll(
      await this.db.from("expenses").select("trip_id").eq("status", "complete").gte("created_at", from.toISOString()).lt("created_at", to.toISOString()),
      "expenses recorded between",
    );
    const counts = new Map<TripId, number>();
    for (const r of rows) counts.set(r.trip_id as TripId, (counts.get(r.trip_id as TripId) ?? 0) + 1);
    return [...counts].map(([tripId, count]) => ({ tripId, count }));
  }

  async listByTrip(tripId: TripId) {
    const rows = unwrapAll(
      await this.db.from("expenses").select(SELECT).eq("trip_id", tripId).order("occurred_at"),
      "list expenses",
    );
    return (rows as unknown as ExpenseRow[]).map((r) => this.hydrate(r));
  }

  /** Used by the SeatUsage adapter: a seat with money or authorship can't be removed. */
  async isSeatUsed(tripId: TripId, seatId: SeatId) {
    const [created, paid, shared] = await Promise.all([
      this.db.from("expenses").select("id", { count: "exact", head: true }).eq("trip_id", tripId).eq("created_by", seatId),
      this.db.from("expense_payers").select("expense_id", { count: "exact", head: true }).eq("seat_id", seatId),
      this.db.from("expense_shares").select("expense_id", { count: "exact", head: true }).eq("seat_id", seatId),
    ]);
    for (const r of [created, paid, shared]) if (r.error) unwrap(r, "seat usage");
    return [created, paid, shared].some((r) => (r.count ?? 0) > 0);
  }
}
