import { dayKey, expenseTitle } from "@/app/ui/money";

/**
 * What the daily summary card shows (PRODUCT_SPEC §6.9): the day's total, its biggest expenses and
 * where each person stands in the trip. Pure, so the image route stays a thin renderer.
 */
export interface DaySummary {
  day: string;
  total: number;
  count: number;
  /** Expenses still waiting for a rate aren't in the total. */
  pendingRate: number;
  top: Array<{ what: string; payer: string; amount: number }>;
  people: Array<{ name: string; balance: number }>;
  /** People beyond the ones shown. */
  more: number;
}

interface DayExpense {
  status: string;
  type?: string;
  title: string | null;
  category: string;
  occurredAt: string;
  baseAmount: number | null;
  payers: ReadonlyArray<{ seatId: string }>;
}

export const MAX_TOP = 3;
export const MAX_PEOPLE = 8;

export function daySummary(
  day: string,
  expenses: readonly DayExpense[],
  balances: ReadonlyArray<{ seatId: string; balance: number }>,
  nameOf: (seatId: string) => string,
): DaySummary {
  const today = expenses.filter((e) => e.status === "complete" && e.type !== "money_received" && dayKey(e.occurredAt) === day);
  const priced = today.filter((e) => e.baseAmount !== null);
  const top = [...priced]
    .sort((a, b) => b.baseAmount! - a.baseAmount!)
    .slice(0, MAX_TOP)
    .map((e) => ({
      what: expenseTitle(e),
      payer: e.payers.length === 1 ? nameOf(e.payers[0].seatId) : `${e.payers.length} personas`,
      amount: e.baseAmount!,
    }));
  // Biggest balances first (owed or owing), so the card shows who matters when it can't show all.
  const people = [...balances].sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)).map((b) => ({ name: nameOf(b.seatId), balance: b.balance }));
  return {
    day,
    total: priced.reduce((sum, e) => sum + e.baseAmount!, 0),
    count: today.length,
    pendingRate: today.length - priced.length,
    top,
    people: people.slice(0, MAX_PEOPLE),
    more: Math.max(0, people.length - MAX_PEOPLE),
  };
}
