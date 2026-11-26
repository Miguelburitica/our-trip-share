import { describe, expect, it } from "vitest";
import { SeatId } from "@/shared-kernel/ids";
import { computeBalances } from "./balances";
import type { LedgerEntry, SettlementLike } from "./ledger-entry";
import { potSummary, settlePot } from "./pot";
import { ExpenseId } from "@/shared-kernel/ids";

const [ana, beto, caro, vaca] = ["ana", "beto", "caro", "vaca"].map(SeatId);
const pot = { seatId: vaca, holderSeatId: ana };
const seats = [ana, beto, caro, vaca];
const put = (from: SeatId, amount: number): SettlementLike => ({ from, to: vaca, baseAmount: amount, status: "confirmed" });
const back = (to: SeatId, amount: number): SettlementLike => ({ from: vaca, to, baseAmount: amount, status: "confirmed" });
const dinner = (amount: number): LedgerEntry => ({
  expenseId: ExpenseId("cena"),
  sign: 1,
  payers: [{ seatId: vaca, base: amount }],
  shares: [ana, beto, caro].map((s, i) => ({ seatId: s, base: Math.floor(amount / 3) + (i < amount % 3 ? 1 : 0) })),
});

describe("La vaca", () => {
  it("holds contributions minus what it paid", () => {
    const settlements = [put(ana, 100_000), put(beto, 100_000)];
    const { balances } = computeBalances(seats, [dinner(120_000)], settlements);
    expect(potSummary(pot, balances, settlements)).toEqual({
      cash: 80_000,
      contributions: [
        { seatId: ana, amount: 100_000 },
        { seatId: beto, amount: 100_000 },
      ],
    });
  });

  it("refunds the leftover in proportion to what each put in", () => {
    const settlements = [put(ana, 150_000), put(beto, 50_000)];
    const { balances } = computeBalances(seats, [dinner(120_000)], settlements);
    const settled = settlePot(pot, balances, settlements);
    expect(settled.refunds).toEqual([
      { from: vaca, to: ana, amount: 60_000 },
      { from: vaca, to: beto, amount: 20_000 },
    ]);
    expect(Object.fromEntries(settled.balances)).toEqual({ ana: 50_000, beto: -10_000, caro: -40_000, vaca: 0 });
  });

  it("counts refunds already made", () => {
    const settlements = [put(ana, 100_000), put(beto, 100_000), back(ana, 40_000)];
    const { balances } = computeBalances(seats, [dinner(120_000)], settlements);
    expect(settlePot(pot, balances, settlements).refunds).toEqual([{ from: vaca, to: beto, amount: 40_000 }]);
  });

  it("charges an overspent pot to its holder, who fronted the difference", () => {
    const settlements = [put(beto, 100_000)];
    const { balances } = computeBalances(seats, [dinner(150_000)], settlements);
    expect(potSummary(pot, balances, settlements).cash).toBe(-50_000);
    const settled = settlePot(pot, balances, settlements);
    expect(settled.refunds).toEqual([]);
    expect(settled.balances.get(vaca)).toBe(0);
    expect(settled.balances.get(ana)).toBe(50_000 - 50_000);
  });
});
