import { describe, expect, it } from "vitest";
import { DAY } from "@/shared-kernel/clock";
import { DomainError } from "@/shared-kernel/errors";
import { ExpenseId, SeatId, SettlementId, TripId } from "@/shared-kernel/ids";
import { isWithinDust } from "@/shared-kernel/money/money";
import { computeBalances, detectReopened, ledgerBalances, overpaymentCredit } from "./balances";
import type { LedgerEntry } from "./ledger-entry";
import { buildSettlingPlan, mergeSettlingPlan, planDirect, planHub, planSimplified } from "./plan";
import { Settlement } from "./settlement";

const [mateo, ana, leo, caro, juli, andres] = ["mateo", "ana", "leo", "caro", "juli", "andres"].map(SeatId);
const everyone = [mateo, ana, leo, caro, juli, andres];

const entry = (id: string, payer: SeatId, total: number, participants: SeatId[], sign: 1 | -1 = 1): LedgerEntry => ({
  expenseId: ExpenseId(id),
  sign,
  payers: [{ seatId: payer, base: total }],
  shares: participants.map((seatId) => ({ seatId, base: total / participants.length })),
});

/** The Cartagena trip from the spec. */
const cartagena: LedgerEntry[] = [
  entry("airbnb", mateo, 2_400_000, everyone),
  entry("cena", ana, 540_000, everyone),
  entry("taxi", leo, 84_000, [mateo, leo, caro, juli]),
  entry("super", caro, 312_000, everyone),
  entry("lancha", andres, 900_000, everyone),
  entry("cervezas", juli, 96_000, [juli, leo, andres, ana]),
];

const asObject = (m: Map<SeatId, number>) => Object.fromEntries(m);
const sortT = <T extends { from: string; to: string }>(ts: T[]) => [...ts].sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1));
const code = (fn: () => unknown) => {
  try {
    fn();
    return "ok";
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
};
const now = new Date("2026-11-24T12:00:00Z");
const pay = (from: SeatId, to: SeatId, amount: number, recordedBy: SeatId, isAdmin = false) =>
  Settlement.record(
    { id: SettlementId(`s-${from}-${to}-${amount}`), tripId: TripId("t"), from, to, amount, currency: "COP", baseAmount: amount, method: "breb" },
    { seatId: recordedBy, isAdmin },
    now,
  );

describe("Balances", () => {
  it("derives the Cartagena balances", () => {
    const { balances } = computeBalances(everyone, cartagena, []);
    expect(asObject(balances)).toEqual({
      mateo: 1_687_000,
      andres: 184_000,
      ana: -176_000,
      caro: -401_000,
      juli: -641_000,
      leo: -653_000,
    });
  });

  it("ignores pending settlements but returns them for display", () => {
    const pending = pay(juli, mateo, 641_000, juli);
    const { balances, pending: shown } = computeBalances(everyone, cartagena, [pending]);
    expect(balances.get(juli)).toBe(-641_000);
    expect(shown).toHaveLength(1);
  });

  it("counts confirmed settlements", () => {
    const received = pay(leo, mateo, 653_000, mateo);
    expect(received.status).toBe("confirmed");
    const { balances } = computeBalances(everyone, cartagena, [received]);
    expect(balances.get(leo)).toBe(0);
    expect(balances.get(mateo)).toBe(1_034_000);
  });

  it("negates money received", () => {
    const refund = entry("deposito", ana, 300_000, [ana, leo, caro], -1);
    expect(asObject(ledgerBalances([ana, leo, caro], [refund]))).toEqual({ ana: -200_000, leo: 100_000, caro: 100_000 });
  });

  it("treats leftovers below the dust tolerance as settled", () => {
    expect(isWithinDust(-40, "COP")).toBe(true);
  });

  it("detects reopened balances", () => {
    const before = ledgerBalances(everyone, cartagena);
    const edited = cartagena.map((e) => (e.expenseId === "cena" ? entry("cena", ana, 612_000, everyone) : e));
    const after = ledgerBalances(everyone, edited);
    expect(detectReopened(before, after, new Set([juli]))).toEqual([{ seatId: juli, delta: -12_000 }]);
  });
});

describe("Settlement plans", () => {
  const { balances } = computeBalances(everyone, cartagena, []);

  it("simplified: 5 deterministic transfers", () => {
    const plan = planSimplified(balances);
    expect(sortT(plan)).toEqual(
      sortT([
        { from: leo, to: mateo, amount: 653_000 },
        { from: juli, to: mateo, amount: 641_000 },
        { from: caro, to: mateo, amount: 393_000 },
        { from: caro, to: andres, amount: 8_000 },
        { from: ana, to: andres, amount: 176_000 },
      ]),
    );
    expect(planSimplified(balances)).toEqual(plan);
  });

  it("simplified plan always settles everyone with at most n−1 transfers", () => {
    const plan = planSimplified(balances);
    expect(plan.length).toBeLessThanOrEqual(everyone.length - 1);
    const after = new Map(balances);
    for (const t of plan) {
      after.set(t.from, after.get(t.from)! + t.amount);
      after.set(t.to, after.get(t.to)! - t.amount);
    }
    expect([...after.values()].every((v) => v === 0)).toBe(true);
  });

  it("hub: everyone settles with Mateo", () => {
    expect(sortT(planHub(balances, mateo))).toEqual(
      sortT([
        { from: leo, to: mateo, amount: 653_000 },
        { from: juli, to: mateo, amount: 641_000 },
        { from: caro, to: mateo, amount: 401_000 },
        { from: ana, to: mateo, amount: 176_000 },
        { from: mateo, to: andres, amount: 184_000 },
      ]),
    );
  });

  it("direct: pairwise debts from shared expenses (15 transfers)", () => {
    const plan = planDirect(cartagena);
    expect(plan).toHaveLength(15);
    expect(plan).toEqual(
      expect.arrayContaining([
        { from: juli, to: mateo, amount: 400_000 },
        { from: leo, to: mateo, amount: 379_000 },
        { from: caro, to: mateo, amount: 348_000 },
        { from: ana, to: mateo, amount: 310_000 },
      ]),
    );
  });

  it("frozen plan only adds deltas for later expenses", () => {
    const frozenLedger = ledgerBalances(everyone, cartagena);
    const frozen = planSimplified(frozenLedger);
    const current = ledgerBalances(everyone, [...cartagena, entry("taxi-2", ana, 60_000, [ana, leo])]);
    const result = buildSettlingPlan({ frozen, balances: current, confirmedSinceFreeze: [] });
    expect(result.frozen).toEqual(frozen);
    expect(result.deltas).toEqual([{ from: leo, to: ana, amount: 30_000 }]);
  });

  it("frozen transfers shrink as they are paid", () => {
    const frozenLedger = ledgerBalances(everyone, cartagena);
    const frozen = planSimplified(frozenLedger);
    const paid = pay(leo, mateo, 653_000, mateo);
    const { balances } = computeBalances(everyone, cartagena, [paid.toPrimitives()]);
    const result = buildSettlingPlan({ frozen, balances, confirmedSinceFreeze: [paid.toPrimitives()] });
    expect(result.frozen.find((t) => t.from === leo)).toBeUndefined();
    expect(result.frozen).toHaveLength(4);
    expect(result.deltas).toEqual([]);
  });

  it("a payment off the frozen plan becomes a delta instead of disappearing", () => {
    const frozenLedger = ledgerBalances(everyone, cartagena);
    const frozen = planSimplified(frozenLedger);
    // Leo pays Juli directly, which no frozen row covers.
    const paid = pay(leo, juli, 100_000, juli);
    const { balances } = computeBalances(everyone, cartagena, [paid.toPrimitives()]);
    const result = buildSettlingPlan({ frozen, balances, confirmedSinceFreeze: [paid.toPrimitives()] });
    expect(result.frozen).toEqual(frozen);
    expect(result.deltas).toEqual([{ from: juli, to: leo, amount: 100_000 }]);
  });

  it("merges deltas into the frozen rows they touch", () => {
    const rows = mergeSettlingPlan({
      frozen: [
        { from: leo, to: mateo, amount: 50_000 },
        { from: juli, to: ana, amount: 20_000 },
      ],
      deltas: [
        { from: leo, to: mateo, amount: 10_000 },
        { from: ana, to: juli, amount: 30_000 },
        { from: caro, to: ana, amount: 5_000 },
      ],
    });
    expect(rows).toEqual([
      { from: leo, to: mateo, amount: 60_000, adjusted: true },
      { from: ana, to: juli, amount: 10_000, adjusted: true },
      { from: caro, to: ana, amount: 5_000, adjusted: true },
    ]);
  });
});

describe("Settlement payments", () => {
  it("is pending when the sender records it and confirmed when the receiver does", () => {
    expect(pay(juli, mateo, 641_000, juli).status).toBe("pending");
    expect(pay(leo, mateo, 653_000, mateo).status).toBe("confirmed");
  });

  it("forbids plain members from recording between others, allows admins", () => {
    expect(code(() => pay(leo, ana, 10_000, caro))).toBe("forbidden");
    expect(pay(leo, ana, 10_000, mateo, true).status).toBe("pending");
  });

  it("lets only the receiver confirm or dispute", () => {
    const s = pay(juli, mateo, 641_000, juli);
    expect(code(() => s.confirm({ seatId: juli, isAdmin: false }, now))).toBe("forbidden");
    s.dispute({ seatId: mateo, isAdmin: false }, now);
    expect(s.status).toBe("disputed");
    s.resend({ seatId: juli, isAdmin: false }, now);
    s.confirm({ seatId: mateo, isAdmin: false }, now);
    expect(s.status).toBe("confirmed");
  });

  it("auto-confirms after 3 days", () => {
    const s = pay(juli, mateo, 641_000, juli);
    expect(s.autoConfirmIfDue(new Date(now.getTime() + 2 * DAY))).toBe(false);
    expect(s.autoConfirmIfDue(new Date(now.getTime() + 3 * DAY))).toBe(true);
    expect(s.status).toBe("confirmed");
  });

  it("corrects by reversal, only admins", () => {
    const s = pay(leo, mateo, 65_300, mateo);
    expect(code(() => s.reverse({ seatId: leo, isAdmin: false }, now))).toBe("forbidden");
    s.reverse({ seatId: mateo, isAdmin: true }, now);
    expect(s.status).toBe("reversed");
    const { balances } = computeBalances(everyone, cartagena, [s]);
    expect(balances.get(leo)).toBe(-653_000);
  });

  it("requires a note for offsets and rejects self-payments", () => {
    expect(
      code(() =>
        Settlement.record(
          { id: SettlementId("x"), tripId: TripId("t"), from: ana, to: leo, amount: 1, currency: "COP", baseAmount: 1, method: "offset" },
          { seatId: ana, isAdmin: false },
          now,
        ),
      ),
    ).toBe("validation");
    expect(code(() => pay(ana, ana, 1, ana))).toBe("validation");
  });

  it("warns about overpayment with the resulting credit", () => {
    expect(overpaymentCredit(-176_000, 200_000)).toBe(24_000);
    expect(overpaymentCredit(-176_000, 176_000)).toBe(0);
  });

  it("a USD settlement in full carries the exact base amount", () => {
    const s = Settlement.record(
      { id: SettlementId("usd"), tripId: TripId("t"), from: juli, to: mateo, amount: 15500, currency: "USD", baseAmount: 641_000, method: "paypal" },
      { seatId: mateo, isAdmin: false },
      now,
    );
    const { balances } = computeBalances(everyone, cartagena, [s]);
    expect(balances.get(juli)).toBe(0);
  });
});
