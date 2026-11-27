import { describe, expect, it } from "vitest";
import { DomainError } from "@/shared-kernel/errors";
import { ExpenseId, NoticeId, SeatId, TripId } from "@/shared-kernel/ids";
import { balanceDeltas, detectNotices, detectReopened, type LedgerChange } from "./balance-notice";
import type { LedgerEntry, SettlementLike } from "./ledger-entry";

const [mateo, juli, leo] = ["mateo", "juli", "leo"].map(SeatId);
const dinner = (shares: Array<[SeatId, number]>): LedgerEntry => ({
  expenseId: ExpenseId("cena"),
  sign: 1,
  payers: [{ seatId: mateo, base: shares.reduce((a, [, b]) => a + b, 0) }],
  shares: shares.map(([seatId, base]) => ({ seatId, base })),
});
const change = (before: LedgerEntry | null, after: LedgerEntry | null, by = mateo): LedgerChange => ({
  tripId: TripId("t"),
  cause: { kind: "edited", expenseId: ExpenseId("cena"), title: "Cena", category: "comida" },
  by,
  at: new Date("2026-11-22T00:00:00Z"),
  before,
  after,
});
const settled: SettlementLike[] = [{ from: juli, to: mateo, baseAmount: 100_000, status: "confirmed" }];
let n = 0;
const ids = () => NoticeId(`n${++n}`);

describe("Balance reopened (R14)", () => {
  it("computes each seat's delta from one change", () => {
    const d = balanceDeltas(dinner([[juli, 30_000], [leo, 30_000]]), dinner([[juli, 42_000], [leo, 30_000]]));
    expect(Object.fromEntries(d)).toEqual({ [mateo]: 12_000, [juli]: -12_000 });
  });

  it("notifies Juli when the dinner is edited after she settled (spec scenario)", () => {
    const notices = detectReopened(change(dinner([[juli, 30_000], [leo, 30_000]]), dinner([[juli, 42_000], [leo, 30_000]])), settled, ids);
    // Mateo also has a confirmed settlement, but he made the change.
    expect(notices.map((x) => x.toPrimitives()).map((p) => [p.seatId, p.delta])).toEqual([[juli, -12_000]]);
  });

  it("ignores seats without confirmed settlements, pending ones and no-op edits", () => {
    const pending: SettlementLike[] = [{ from: leo, to: mateo, baseAmount: 1, status: "pending" }];
    expect(detectReopened(change(null, dinner([[leo, 30_000]])), pending, ids)).toEqual([]);
    const same = dinner([[juli, 30_000]]);
    expect(detectReopened(change(same, same, leo), settled, ids)).toEqual([]);
  });

  it("covers deletes and notifies the receiver of a settlement too", () => {
    const notices = detectReopened(change(dinner([[juli, 30_000]]), null, leo), settled, ids);
    expect(notices.map((x) => [x.seatId, x.toPrimitives().delta])).toEqual([
      [mateo, -30_000],
      [juli, 30_000],
    ]);
  });

  it("can only be dismissed by its addressee", () => {
    const [notice] = detectReopened(change(null, dinner([[juli, 5_000]])), settled, ids);
    expect(() => notice.dismiss(leo, new Date())).toThrow(DomainError);
    notice.dismiss(juli, new Date("2026-11-23T00:00:00Z"));
    expect(notice.toPrimitives().dismissedAt).toEqual(new Date("2026-11-23T00:00:00Z"));
  });
});

describe("Someone else recorded what you paid", () => {
  const vaca = SeatId("vaca");
  const toll = (payer: SeatId, amount: number): LedgerEntry => ({
    expenseId: ExpenseId("peaje"),
    sign: 1,
    payers: [{ seatId: payer, base: amount }],
    shares: [mateo, juli, leo].map((seatId, i) => ({ seatId, base: amount / 3 + (i === 0 ? amount % 3 : 0) })),
  });
  const summary = (c: LedgerChange, s: SettlementLike[] = [], skip = new Set<SeatId>()) =>
    detectNotices(c, s, ids, skip).map((x) => {
      const p = x.toPrimitives();
      return [p.seatId, p.reason, p.paid];
    });

  it("tells Leo when Juli records the toll he paid while driving", () => {
    expect(summary(change(null, toll(leo, 18_000), juli))).toEqual([[leo, "paid", { before: 0, after: 18_000 }]]);
  });

  it("says nothing when you record your own payment", () => {
    expect(summary(change(null, toll(juli, 18_000), juli))).toEqual([]);
  });

  it("tells both when the payer changes, and when it is deleted", () => {
    expect(summary(change(toll(leo, 18_000), toll(mateo, 18_000), juli))).toEqual([
      [leo, "paid", { before: 18_000, after: 0 }],
      [mateo, "paid", { before: 0, after: 18_000 }],
    ]);
    expect(summary(change(toll(leo, 18_000), null, juli))).toEqual([[leo, "paid", { before: 18_000, after: 0 }]]);
  });

  it("keeps one notice per seat: a settled payer gets 'paid', other settled seats 'reopened'", () => {
    const juliSettled: SettlementLike[] = [{ from: juli, to: leo, baseAmount: 1, status: "confirmed" }];
    expect(summary(change(null, toll(leo, 18_000), mateo), juliSettled)).toEqual([
      [leo, "paid", { before: 0, after: 18_000 }],
      [juli, "reopened", null],
    ]);
  });

  it("never notifies la vaca", () => {
    expect(summary(change(null, toll(vaca, 18_000), juli), [], new Set([vaca]))).toEqual([]);
  });
});
