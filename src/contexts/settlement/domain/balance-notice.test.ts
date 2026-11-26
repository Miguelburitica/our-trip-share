import { describe, expect, it } from "vitest";
import { DomainError } from "@/shared-kernel/errors";
import { ExpenseId, NoticeId, SeatId, TripId } from "@/shared-kernel/ids";
import { balanceDeltas, detectReopened, type LedgerChange } from "./balance-notice";
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
