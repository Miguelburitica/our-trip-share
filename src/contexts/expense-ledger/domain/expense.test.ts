import { describe, expect, it } from "vitest";
import { DomainError } from "@/shared-kernel/errors";
import { ExpenseId, SeatId, TripId } from "@/shared-kernel/ids";
import { sum } from "@/shared-kernel/money/money";
import { Expense, type Context } from "./expense";
import { evaluateGuards } from "./guards";
import type { LedgerTripView } from "./trip-view";

const [mateo, ana, leo, caro, juli, andres] = ["mateo", "ana", "leo", "caro", "juli", "andres"].map(SeatId);

function view(overrides: Partial<LedgerTripView> = {}): LedgerTripView {
  return {
    tripId: TripId("trip-1"),
    status: "active",
    baseCurrency: "COP",
    seats: [mateo, ana, leo, caro, juli, andres].map((id) => ({
      id,
      active: true,
      defaultExcluded: false,
      isAdmin: id === mateo,
    })),
    ...overrides,
  };
}

const at = (iso: string) => new Date(iso);
const ctx = (actor = mateo, trip = view(), now = at("2026-11-21T21:40:00Z")): Context => ({ actor, trip, now });
const code = (fn: () => unknown) => {
  try {
    fn();
    return "ok";
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
};
let n = 0;
const nextId = () => ExpenseId(`exp-${++n}`);

describe("Record an expense (quick add)", () => {
  it("defaults to 'otro', payer = actor, all active seats, equal split", () => {
    const e = Expense.record({ id: nextId(), currency: "COP", amount: 184000 }, ctx());
    const m = e.money!;
    expect(e.category).toBe("otro");
    expect(m.payerIds).toEqual([mateo]);
    expect(m.participantIds).toHaveLength(6);
    expect(sum(m.props.shares.map((s) => s.amount))).toBe(184000);
    expect(m.props.splitMethod).toBe("equal");
  });

  it("rejects new expenses on a closed trip", () => {
    expect(code(() => Expense.record({ id: nextId(), currency: "COP", amount: 1000 }, ctx(mateo, view({ status: "closed" }))))).toBe(
      "invalid_state",
    );
  });

  it("respects default exclusion", () => {
    const trip = view();
    const excluded = { ...trip, seats: trip.seats.map((s) => (s.id === andres ? { ...s, defaultExcluded: true } : s)) };
    const e = Expense.record({ id: nextId(), currency: "COP", amount: 100000 }, ctx(mateo, excluded));
    expect(e.money!.participantIds).not.toContain(andres);
  });
});

describe("Split rules", () => {
  it("splits 540.000 among 6 as 90.000", () => {
    const e = Expense.record(
      { id: nextId(), currency: "COP", amount: 540000, payers: [{ seatId: ana }] },
      ctx(ana),
    );
    expect(e.money!.props.shares.every((s) => s.amount === 90000)).toBe(true);
  });

  it("splits 100.000 among 3 deterministically", () => {
    const id = ExpenseId("exp-fixed");
    const input = { id, currency: "COP", amount: 100000, split: { method: "equal" as const, participants: [ana, leo, caro] } };
    const a = Expense.record(input, ctx()).money!.props.shares.map((s) => s.amount);
    const b = Expense.record(input, ctx()).money!.props.shares.map((s) => s.amount);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([33333, 33333, 33334]);
  });

  it("accepts exact amounts that match and reports what is missing otherwise", () => {
    const ok = Expense.record(
      {
        id: nextId(),
        currency: "COP",
        amount: 300000,
        split: { method: "exact", shares: [{ seatId: ana, amount: 150000 }, { seatId: leo, amount: 100000 }, { seatId: caro, amount: 50000 }] },
      },
      ctx(),
    );
    expect(ok.money!.props.shares.map((s) => s.amount)).toEqual([150000, 100000, 50000]);

    let error: DomainError | undefined;
    try {
      Expense.record(
        {
          id: nextId(),
          currency: "COP",
          amount: 300000,
          split: { method: "exact", shares: [{ seatId: ana, amount: 150000 }, { seatId: leo, amount: 100000 }, { seatId: caro, amount: 40000 }] },
        },
        ctx(),
      );
    } catch (e) {
      error = e as DomainError;
    }
    expect(error?.code).toBe("validation");
    expect(error?.details).toEqual({ missing: 10000 });
  });

  it("allows the payer to be excluded", () => {
    const e = Expense.record(
      { id: nextId(), currency: "COP", amount: 96000, split: { method: "equal", participants: [juli, leo, andres, ana] } },
      ctx(),
    );
    expect(e.money!.shareOf(mateo)).toBeUndefined();
    expect(e.money!.props.shares.every((s) => s.amount === 24000)).toBe(true);
  });

  it("rejects zero participants, fractional amounts and foreign seats", () => {
    expect(code(() => Expense.record({ id: nextId(), currency: "COP", amount: 1000, split: { method: "equal", participants: [] } }, ctx()))).toBe("validation");
    expect(code(() => Expense.record({ id: nextId(), currency: "COP", amount: 184000.5 }, ctx()))).toBe("validation");
    expect(
      code(() => Expense.record({ id: nextId(), currency: "COP", amount: 1000, split: { method: "equal", participants: [SeatId("intruso")] } }, ctx())),
    ).toBe("validation");
  });

  it("money received has the opposite sign", () => {
    const e = Expense.record(
      { id: nextId(), type: "money_received", currency: "COP", amount: 300000, payers: [{ seatId: ana }], split: { method: "equal", participants: [ana, leo, caro] } },
      ctx(ana),
    );
    expect(e.sign).toBe(-1);
    expect(e.money!.props.shares.every((s) => s.amount === 100000)).toBe(true);
  });
});

describe("Currency conversion", () => {
  it("converts 100.00 USD at 4123.7 and allocates base shares exactly", () => {
    const e = Expense.record(
      {
        id: nextId(),
        currency: "USD",
        amount: 10000,
        fx: { kind: "rate", rate: "4123.7", source: "api" },
        split: { method: "equal", participants: [ana, leo, caro] },
      },
      ctx(),
    );
    const m = e.money!.props;
    expect(m.baseAmount).toBe(412370);
    expect(sum(m.shares.map((s) => s.baseAmount!))).toBe(412370);
    expect(sum(m.payers.map((p) => p.baseAmount!))).toBe(412370);
  });

  it("uses the card charge as base amount", () => {
    const e = Expense.record(
      { id: nextId(), currency: "EUR", amount: 10000, fx: { kind: "card_charge", baseAmount: 486000 } },
      ctx(),
    );
    expect(e.money!.props.baseAmount).toBe(486000);
    expect(e.money!.props.fxSource).toBe("card_charge");
  });

  it("marks rate pending without a rate and excludes it from balances", () => {
    const e = Expense.record({ id: nextId(), currency: "USD", amount: 2000 }, ctx());
    expect(e.money!.ratePending).toBe(true);
    expect(e.countsTowardBalances).toBe(false);
  });
});

describe("Drafts", () => {
  it("snaps a receipt as a draft that does not count, then completes it", () => {
    const e = Expense.draft({ id: nextId(), receiptPath: "receipts/r1.jpg" }, ctx());
    expect(e.status).toBe("draft");
    expect(e.countsTowardBalances).toBe(false);
    e.completeDraft({ currency: "COP", amount: 120000, split: { method: "equal", participants: [mateo, ana, leo, caro] } }, ctx());
    expect(e.status).toBe("complete");
    expect(e.countsTowardBalances).toBe(true);
    expect(e.moneyVersion).toBe(1);
  });
});

describe("Versioned money edits and payer permission", () => {
  it("rejects a stale edit as a conflict", () => {
    const e = Expense.record({ id: nextId(), currency: "COP", amount: 300000, payers: [{ seatId: ana }] }, ctx(ana));
    e.changeMoney(1, { currency: "COP", amount: 360000 }, ctx(ana));
    expect(e.moneyVersion).toBe(2);
    expect(code(() => e.changeMoney(1, { currency: "COP", amount: 310000 }, ctx(leo)))).toBe("conflict");
    expect(e.money!.props.amount).toBe(360000);
  });

  it("keeps payers and participants when an edit doesn't mention them", () => {
    const e = Expense.record(
      { id: nextId(), currency: "COP", amount: 300000, payers: [{ seatId: ana }], split: { method: "equal", participants: [ana, leo, caro] } },
      ctx(ana),
    );
    e.changeMoney(1, { currency: "COP", amount: 330000 }, ctx(leo));
    expect(e.money!.payerIds).toEqual([ana]);
    expect(e.money!.participantIds).toEqual([ana, leo, caro]);
    expect(e.money!.props.shares.every((s) => s.amount === 110000)).toBe(true);
  });

  it("only lets the old payer, new payer or an admin change the payer", () => {
    const e = Expense.record({ id: nextId(), currency: "COP", amount: 540000, payers: [{ seatId: ana }] }, ctx(ana));
    expect(code(() => e.changeMoney(1, { currency: "COP", amount: 540000, payers: [{ seatId: caro }] }, ctx(leo)))).toBe("forbidden");
    e.changeMoney(1, { currency: "COP", amount: 540000, payers: [{ seatId: caro }] }, ctx(ana));
    expect(e.money!.payerIds).toEqual([caro]);
    e.changeMoney(2, { currency: "COP", amount: 540000, payers: [{ seatId: leo }] }, ctx(mateo));
    expect(e.money!.payerIds).toEqual([leo]);
  });
});

describe("Soft delete and history", () => {
  it("removes from balances and records who deleted it", () => {
    const e = Expense.record({ id: nextId(), currency: "COP", amount: 312000, payers: [{ seatId: caro }] }, ctx(caro));
    e.delete(ctx(caro));
    expect(e.countsTowardBalances).toBe(false);
    expect(e.history.at(-1)).toMatchObject({ kind: "deleted", by: caro });
  });
});

describe("Guards", () => {
  it("warns about personal expenses", () => {
    const e = Expense.record({ id: nextId(), currency: "COP", amount: 30000, split: { method: "equal", participants: [mateo] } }, ctx());
    expect(evaluateGuards(e, [])).toEqual([{ code: "personal" }]);
  });

  it("warns about a possible duplicate within 30 minutes", () => {
    const first = Expense.record({ id: nextId(), currency: "COP", amount: 184000, payers: [{ seatId: ana }] }, ctx(ana, view(), at("2026-11-21T21:40:00Z")));
    const second = Expense.record({ id: nextId(), currency: "COP", amount: 184000 }, ctx(mateo, view(), at("2026-11-21T21:42:00Z")));
    expect(evaluateGuards(second, [first])).toEqual([{ code: "possible_duplicate", expenseId: first.id }]);
  });

  it("warns about unusually large amounts but never for lodging", () => {
    const small = [50000, 60000, 70000, 80000, 90000].map((amount) => Expense.record({ id: nextId(), currency: "COP", amount }, ctx(mateo, view(), at("2026-11-20T10:00:00Z"))));
    const big = Expense.record({ id: nextId(), currency: "COP", amount: 1840000 }, ctx());
    expect(evaluateGuards(big, small).map((w) => w.code)).toEqual(["unusually_large"]);
    const lodging = Expense.record({ id: nextId(), currency: "COP", amount: 2400000, category: "alojamiento" }, ctx());
    expect(evaluateGuards(lodging, small)).toEqual([]);
  });
});
