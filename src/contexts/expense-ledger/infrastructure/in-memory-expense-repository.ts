import { conflict } from "@/shared-kernel/errors";
import type { ExpenseId, SeatId, TripId } from "@/shared-kernel/ids";
import type { ExpenseRepository } from "../application/ports";
import { Expense, type ExpenseProps } from "../domain/expense";

export class InMemoryExpenseRepository implements ExpenseRepository {
  private rows = new Map<ExpenseId, ExpenseProps>();

  async get(id: ExpenseId) {
    const row = this.rows.get(id);
    return row ? Expense.fromPrimitives(structuredClone(row)) : null;
  }

  async save(expense: Expense, expectedMoneyVersion: number | null) {
    const current = this.rows.get(expense.id);
    if (current && expectedMoneyVersion !== null && current.moneyVersion !== expectedMoneyVersion) {
      throw conflict("Alguien editó este gasto mientras tanto");
    }
    if (current && expectedMoneyVersion === null) throw conflict("El gasto ya existe");
    this.rows.set(expense.id, structuredClone(expense.toPrimitives()));
  }

  async listByTrip(tripId: TripId) {
    return [...this.rows.values()].filter((r) => r.tripId === tripId).map((r) => Expense.fromPrimitives(structuredClone(r)));
  }

  /** Used by the SeatUsage adapter. */
  async isSeatUsed(tripId: TripId, seatId: SeatId) {
    return [...this.rows.values()].some(
      (r) =>
        r.tripId === tripId &&
        (r.createdBy === seatId ||
          r.money?.payers.some((p) => p.seatId === seatId) ||
          r.money?.shares.some((s) => s.seatId === seatId)),
    );
  }
}
