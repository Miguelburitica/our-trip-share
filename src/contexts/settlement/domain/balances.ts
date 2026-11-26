import { invalidState } from "@/shared-kernel/errors";
import type { SeatId } from "@/shared-kernel/ids";
import type { LedgerEntry, SettlementLike } from "./ledger-entry";

export type Balances = Map<SeatId, number>;

/** Ledger-only balances: paid − owed over complete expenses (money received counts negated). */
export function ledgerBalances(seatIds: readonly SeatId[], entries: readonly LedgerEntry[]): Balances {
  const balances: Balances = new Map(seatIds.map((id) => [id, 0]));
  const add = (seat: SeatId, delta: number) => balances.set(seat, (balances.get(seat) ?? 0) + delta);
  for (const entry of entries) {
    for (const p of entry.payers) add(p.seatId, entry.sign * p.base);
    for (const s of entry.shares) add(s.seatId, -entry.sign * s.base);
  }
  return balances;
}

/**
 * Domain service. A seat's balance = paid − owed + confirmed settlements sent − received.
 * Pending/disputed/reversed settlements don't count; pending ones are returned for display.
 */
export function computeBalances(
  seatIds: readonly SeatId[],
  entries: readonly LedgerEntry[],
  settlements: readonly SettlementLike[],
): { balances: Balances; pending: SettlementLike[] } {
  const balances = ledgerBalances(seatIds, entries);
  const add = (seat: SeatId, delta: number) => balances.set(seat, (balances.get(seat) ?? 0) + delta);
  const pending: SettlementLike[] = [];
  for (const s of settlements) {
    if (s.status === "confirmed") {
      add(s.from, s.baseAmount);
      add(s.to, -s.baseAmount);
    } else if (s.status === "pending") {
      pending.push(s);
    }
  }
  assertZeroSum(balances);
  return { balances, pending };
}

export function assertZeroSum(balances: Balances) {
  let total = 0;
  for (const v of balances.values()) total += v;
  if (total !== 0) throw invalidState("Balances do not sum to zero", { total });
}

/** Positive when the settlement leaves the sender with a credit. */
export function overpaymentCredit(senderBalance: number, settlementBase: number): number {
  const credit = settlementBase + senderBalance;
  return credit > 0 ? credit : 0;
}

export interface BalanceReopened {
  readonly seatId: SeatId;
  readonly delta: number;
}

/** Seats with a confirmed settlement whose balance moved because of a ledger change. */
export function detectReopened(
  before: Balances,
  after: Balances,
  seatsWithConfirmedSettlement: ReadonlySet<SeatId>,
): BalanceReopened[] {
  const events: BalanceReopened[] = [];
  for (const seatId of seatsWithConfirmedSettlement) {
    const delta = (after.get(seatId) ?? 0) - (before.get(seatId) ?? 0);
    if (delta !== 0) events.push({ seatId, delta });
  }
  return events;
}
