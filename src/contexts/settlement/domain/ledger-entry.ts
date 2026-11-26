import type { ExpenseId, SeatId } from "@/shared-kernel/ids";

/**
 * Settlement's own model of a ledger line (anti-corruption layer):
 * it never sees the expense-ledger's Expense or MoneyBlock.
 * Amounts are in the trip's base-currency units.
 */
export interface LedgerEntry {
  readonly expenseId: ExpenseId;
  /** +1 expense, −1 money received. */
  readonly sign: 1 | -1;
  readonly payers: ReadonlyArray<{ readonly seatId: SeatId; readonly base: number }>;
  readonly shares: ReadonlyArray<{ readonly seatId: SeatId; readonly base: number }>;
}

/** The fields of a settlement that balance math needs. */
export interface SettlementLike {
  readonly from: SeatId;
  readonly to: SeatId;
  readonly baseAmount: number;
  readonly status: "pending" | "confirmed" | "disputed" | "reversed";
}

export interface Transfer {
  readonly from: SeatId;
  readonly to: SeatId;
  readonly amount: number;
}
