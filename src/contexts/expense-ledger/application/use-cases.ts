import type { Clock } from "@/shared-kernel/clock";
import { forbidden, notFound } from "@/shared-kernel/errors";
import { ExpenseId, type IdGenerator, type PrincipalId, type SeatId, type TripId } from "@/shared-kernel/ids";
import { attempt, type Result } from "@/shared-kernel/result";
import { Expense, type Category, type Context, type ExpenseType, type MoneyInput } from "../domain/expense";
import { evaluateGuards, type ExpenseWarning } from "../domain/guards";
import type { ExpenseRepository, MembershipReader } from "./ports";

export interface ExpenseLedgerDeps {
  expenses: ExpenseRepository;
  membership: MembershipReader;
  ids: IdGenerator;
  clock: Clock;
}

export interface ExpenseDTO {
  id: ExpenseId;
  type: ExpenseType;
  status: "draft" | "complete" | "deleted";
  category: Category;
  title: string | null;
  occurredAt: string;
  currency: string | null;
  amount: number | null;
  baseAmount: number | null;
  ratePending: boolean;
  payers: Array<{ seatId: SeatId; amount: number }>;
  shares: Array<{ seatId: SeatId; amount: number; baseAmount: number | null }>;
  myShare: number | null;
  moneyVersion: number;
  createdBy: SeatId;
}

export function toExpenseDTO(expense: Expense, mySeatId: SeatId | null): ExpenseDTO {
  const money = expense.money;
  const mine = mySeatId && money ? money.shareOf(mySeatId) : undefined;
  return {
    id: expense.id,
    type: expense.type,
    status: expense.status,
    category: expense.category,
    title: expense.title,
    occurredAt: expense.occurredAt.toISOString(),
    currency: money?.props.currency ?? null,
    amount: money?.props.amount ?? null,
    baseAmount: money?.props.baseAmount ?? null,
    ratePending: money?.ratePending ?? false,
    payers: money?.props.payers.map((p) => ({ seatId: p.seatId, amount: p.amount })) ?? [],
    shares: money?.props.shares.map((s) => ({ seatId: s.seatId, amount: s.amount, baseAmount: s.baseAmount })) ?? [],
    myShare: mine ? (mine.baseAmount ?? mine.amount) : null,
    moneyVersion: expense.moneyVersion,
    createdBy: expense.createdBy,
  };
}

/** Application service for the expense-ledger context. */
export class ExpenseLedgerUseCases {
  constructor(private readonly deps: ExpenseLedgerDeps) {}

  private async context(principalId: PrincipalId, tripId: TripId): Promise<Context> {
    const trip = await this.deps.membership.getTripView(tripId);
    if (!trip) throw notFound("No encontramos ese viaje");
    const actor = await this.deps.membership.seatOf(tripId, principalId);
    if (!actor) throw forbidden("No eres parte de este viaje");
    return { actor, trip, now: this.deps.clock.now() };
  }

  private async load(tripId: TripId, expenseId: ExpenseId): Promise<Expense> {
    const expense = await this.deps.expenses.get(expenseId);
    if (!expense || expense.tripId !== tripId) throw notFound("No encontramos ese gasto");
    return expense;
  }

  recordExpense(
    principalId: PrincipalId,
    tripId: TripId,
    input: MoneyInput & { type?: ExpenseType; category?: Category; title?: string | null; occurredAt?: Date },
  ): Promise<Result<{ expense: ExpenseDTO; warnings: ExpenseWarning[] }>> {
    return attempt(async () => {
      const ctx = await this.context(principalId, tripId);
      const expense = Expense.record({ ...input, id: ExpenseId(this.deps.ids.next()) }, ctx);
      const others = await this.deps.expenses.listByTrip(tripId);
      await this.deps.expenses.save(expense, null);
      return { expense: toExpenseDTO(expense, ctx.actor), warnings: evaluateGuards(expense, others) };
    });
  }

  snapReceiptDraft(principalId: PrincipalId, tripId: TripId, receiptPath: string): Promise<Result<ExpenseDTO>> {
    return attempt(async () => {
      const ctx = await this.context(principalId, tripId);
      const expense = Expense.draft({ id: ExpenseId(this.deps.ids.next()), receiptPath }, ctx);
      await this.deps.expenses.save(expense, null);
      return toExpenseDTO(expense, ctx.actor);
    });
  }

  completeDraft(
    principalId: PrincipalId,
    tripId: TripId,
    expenseId: ExpenseId,
    input: MoneyInput & { category?: Category; title?: string | null },
  ): Promise<Result<ExpenseDTO>> {
    return attempt(async () => {
      const ctx = await this.context(principalId, tripId);
      const expense = await this.load(tripId, expenseId);
      const before = expense.moneyVersion;
      expense.completeDraft(input, ctx);
      await this.deps.expenses.save(expense, before);
      return toExpenseDTO(expense, ctx.actor);
    });
  }

  editExpenseMoney(
    principalId: PrincipalId,
    tripId: TripId,
    expenseId: ExpenseId,
    expectedVersion: number,
    input: MoneyInput,
  ): Promise<Result<ExpenseDTO>> {
    return attempt(async () => {
      const ctx = await this.context(principalId, tripId);
      const expense = await this.load(tripId, expenseId);
      expense.changeMoney(expectedVersion, input, ctx);
      await this.deps.expenses.save(expense, expectedVersion);
      return toExpenseDTO(expense, ctx.actor);
    });
  }

  deleteExpense(principalId: PrincipalId, tripId: TripId, expenseId: ExpenseId): Promise<Result<void>> {
    return attempt(async () => {
      const ctx = await this.context(principalId, tripId);
      const expense = await this.load(tripId, expenseId);
      const version = expense.moneyVersion;
      expense.delete(ctx);
      await this.deps.expenses.save(expense, version);
    });
  }

  listTripExpenses(principalId: PrincipalId, tripId: TripId): Promise<Result<ExpenseDTO[]>> {
    return attempt(async () => {
      const ctx = await this.context(principalId, tripId);
      const all = await this.deps.expenses.listByTrip(tripId);
      return all
        .filter((e) => e.status !== "deleted")
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
        .map((e) => toExpenseDTO(e, ctx.actor));
    });
  }
}
