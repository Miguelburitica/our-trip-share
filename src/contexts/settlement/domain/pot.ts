import type { SeatId } from "@/shared-kernel/ids";
import { allocate } from "@/shared-kernel/money/allocate";
import type { Balances } from "./balances";
import type { SettlementLike, Transfer } from "./ledger-entry";

/** La vaca: its seat and the member who keeps the money. */
export interface Pot {
  readonly seatId: SeatId;
  readonly holderSeatId: SeatId;
}

export interface PotSummary {
  /** Money in the pot now (contributions − what it paid − refunds made). Negative: overspent. */
  readonly cash: number;
  /** Net confirmed contributions per member (what they put in minus what they got back). */
  readonly contributions: ReadonlyArray<{ seatId: SeatId; amount: number }>;
}

/** A balance is paid − owed + sent − received, so the pot's negated balance is the cash it holds. */
export function potSummary(pot: Pot, balances: Balances, settlements: readonly SettlementLike[]): PotSummary {
  const net = new Map<SeatId, number>();
  for (const s of settlements) {
    if (s.status !== "confirmed") continue;
    if (s.to === pot.seatId) net.set(s.from, (net.get(s.from) ?? 0) + s.baseAmount);
    if (s.from === pot.seatId) net.set(s.to, (net.get(s.to) ?? 0) - s.baseAmount);
  }
  return {
    cash: 0 - (balances.get(pot.seatId) ?? 0) || 0,
    contributions: [...net].filter(([, v]) => v !== 0).map(([seatId, amount]) => ({ seatId, amount })),
  };
}

/**
 * Settling the pot (PRODUCT_SPEC §3.3): what's left is refunded to contributors in proportion to
 * what each put in (largest remainder), as transfers from the pot that its holder makes. Refunds
 * already made count, so each one gets their share of the total once. Anything the refunds can't
 * place (the pot overspent, or someone already got more back) is the holder's: they fronted it or
 * still hold it. Returns the balances with the pot at zero, plus the refunds.
 */
export function settlePot(
  pot: Pot,
  balances: Balances,
  settlements: readonly SettlementLike[],
): { balances: Balances; refunds: Transfer[] } {
  const out: Balances = new Map(balances);
  const cash = 0 - (out.get(pot.seatId) ?? 0) || 0;
  const put = new Map<SeatId, number>();
  const back = new Map<SeatId, number>();
  for (const s of settlements) {
    if (s.status !== "confirmed") continue;
    if (s.to === pot.seatId) put.set(s.from, (put.get(s.from) ?? 0) + s.baseAmount);
    if (s.from === pot.seatId) back.set(s.to, (back.get(s.to) ?? 0) + s.baseAmount);
  }
  const contributors = [...put].filter(([, v]) => v > 0).sort(([a], [b]) => (a < b ? -1 : 1));
  const refunds: Transfer[] = [];
  if (cash > 0 && contributors.length > 0) {
    const refunded = [...back.values()].reduce((a, b) => a + b, 0);
    const shares = allocate(
      cash + refunded,
      contributors.map(([, v]) => v),
      contributors.map(([id]) => `${pot.seatId}:${id}`),
    );
    contributors.forEach(([seatId], i) => {
      const owed = Math.min(shares[i] - (back.get(seatId) ?? 0), cash - refunds.reduce((a, r) => a + r.amount, 0));
      if (owed > 0) refunds.push({ from: pot.seatId, to: seatId, amount: owed });
    });
  }
  for (const r of refunds) {
    out.set(r.to, (out.get(r.to) ?? 0) - r.amount);
    out.set(pot.seatId, (out.get(pot.seatId) ?? 0) + r.amount);
  }
  // Whatever the pot still holds (or owes) is the holder's.
  const rest = out.get(pot.seatId) ?? 0;
  if (rest !== 0) {
    out.set(pot.holderSeatId, (out.get(pot.holderSeatId) ?? 0) + rest);
    out.set(pot.seatId, 0);
  }
  return { balances: out, refunds };
}
