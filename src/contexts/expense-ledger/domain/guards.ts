import { MINUTE } from "@/shared-kernel/clock";
import type { ExpenseId } from "@/shared-kernel/ids";
import type { Expense } from "./expense";

export type ExpenseWarning =
  | { readonly code: "personal" }
  | { readonly code: "possible_duplicate"; readonly expenseId: ExpenseId }
  | { readonly code: "unusually_large"; readonly median: number };

const DUPLICATE_WINDOW = 30 * MINUTE;
const LARGE_FACTOR = 10;
const MIN_EXPENSES_FOR_LARGE = 5;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Domain service: non-blocking warnings shown inline after saving.
 * `others` are the trip's other expenses (any status; only complete ones are compared).
 */
export function evaluateGuards(expense: Expense, others: readonly Expense[]): ExpenseWarning[] {
  const money = expense.money;
  if (!money) return [];
  const warnings: ExpenseWarning[] = [];

  if (money.isPersonal) warnings.push({ code: "personal" });

  const comparable = others.filter((o) => o.id !== expense.id && o.status === "complete" && o.money);
  const duplicate = comparable.find(
    (o) =>
      o.money!.props.amount === money.props.amount &&
      o.money!.props.currency === money.props.currency &&
      Math.abs(o.occurredAt.getTime() - expense.occurredAt.getTime()) <= DUPLICATE_WINDOW,
  );
  if (duplicate) warnings.push({ code: "possible_duplicate", expenseId: duplicate.id });

  const base = money.props.baseAmount;
  const bases = comparable.map((o) => o.money!.props.baseAmount).filter((b): b is number => b !== null);
  if (base !== null && expense.category !== "alojamiento" && bases.length >= MIN_EXPENSES_FOR_LARGE) {
    const m = median(bases);
    if (m > 0 && base >= LARGE_FACTOR * m) warnings.push({ code: "unusually_large", median: m });
  }
  return warnings;
}
