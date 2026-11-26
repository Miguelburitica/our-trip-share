import { describe, expect, it } from "vitest";
import { DomainError } from "@/shared-kernel/errors";
import { ExpenseId, SeatId, SplitGroupId, TripId } from "@/shared-kernel/ids";
import { Expense, type Context } from "./expense";
import { SplitGroup } from "./split-group";
import { suggestSplit } from "./split-suggestion";
import type { LedgerTripView } from "./trip-view";

const [mateo, ana, leo, caro] = ["mateo", "ana", "leo", "caro"].map(SeatId);
const all = [mateo, ana, leo, caro];

const view = (patch: (s: LedgerTripView["seats"][number]) => Partial<LedgerTripView["seats"][number]> = () => ({})): LedgerTripView => ({
  tripId: TripId("trip-1"),
  status: "active",
  baseCurrency: "COP",
  seats: all.map((id) => ({ id, active: true, defaultExcluded: false, isAdmin: id === mateo, ...patch({ id, active: true, defaultExcluded: false, isAdmin: false }) })),
});
const ctx = (actor = mateo, trip = view(), now = new Date("2026-11-21T22:00:00Z")): Context => ({ actor, trip, now });
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
const expense = (participants: SeatId[], iso: string) =>
  Expense.record(
    { id: ExpenseId(`e${++n}`), currency: "COP", amount: 90000, split: { method: "equal", participants }, occurredAt: new Date(iso) },
    ctx(mateo, view(), new Date(iso)),
  );

describe("Quick-add split suggestion", () => {
  const now = new Date("2026-11-21T22:00:00Z");

  it("defaults to everyone when there is no history", () => {
    expect(suggestSplit([], view(), now)).toEqual({ participants: all, sameAsLast: null, preselected: false });
  });

  it("offers the last subgroup as a chip without preselecting it after one expense", () => {
    const s = suggestSplit([expense([mateo, ana], "2026-11-21T20:00:00Z")], view(), now);
    expect(s).toEqual({ participants: all, sameAsLast: [mateo, ana], preselected: false });
  });

  it("preselects a subgroup the last two recent expenses shared", () => {
    const s = suggestSplit(
      [expense([ana, mateo], "2026-11-21T19:00:00Z"), expense([mateo, ana], "2026-11-21T21:00:00Z")],
      view(),
      now,
    );
    expect(s).toEqual({ participants: [mateo, ana], sameAsLast: [mateo, ana], preselected: true });
  });

  it("does not preselect when the earlier one is old or different", () => {
    const old = suggestSplit([expense([mateo, ana], "2026-11-20T08:00:00Z"), expense([mateo, ana], "2026-11-21T21:00:00Z")], view(), now);
    expect(old.preselected).toBe(false);
    const different = suggestSplit([expense([mateo, leo], "2026-11-21T20:00:00Z"), expense([mateo, ana], "2026-11-21T21:00:00Z")], view(), now);
    expect(different).toEqual({ participants: all, sameAsLast: [mateo, ana], preselected: false });
  });

  it("offers nothing when the last expense already matches the default", () => {
    const excluded = view((s) => (s.id === caro ? { defaultExcluded: true } : {}));
    expect(suggestSplit([expense([mateo, ana, leo], "2026-11-21T21:00:00Z")], excluded, now).sameAsLast).toBeNull();
  });
});

describe("Saved split groups", () => {
  const create = (name: string, seatIds: SeatId[], existing: SplitGroup[] = [], c = ctx()) =>
    SplitGroup.create({ id: SplitGroupId(`g${++n}`), name, seatIds }, c, existing);

  it("trims the name, dedupes members and records the creator", () => {
    const g = create("  Carro   1 ", [ana, leo, ana]).toPrimitives();
    expect(g).toMatchObject({ name: "Carro 1", seatIds: [ana, leo], createdBy: mateo });
  });

  it("rejects bad names, duplicates, tiny groups and outsiders", () => {
    const carro = create("Carro 1", [ana, leo]);
    expect(code(() => create(" ", [ana, leo]))).toBe("validation");
    expect(code(() => create("x".repeat(31), [ana, leo]))).toBe("validation");
    expect(code(() => create("carro 1", [mateo, caro], [carro]))).toBe("validation");
    expect(code(() => create("Solo", [ana, ana]))).toBe("validation");
    expect(code(() => create("Raro", [ana, SeatId("x")]))).toBe("validation");
  });

  it("lets only the creator or an admin delete it", () => {
    const g = create("Parejas", [ana, leo], [], ctx(ana));
    expect(code(() => g.assertCanDelete(ctx(leo)))).toBe("forbidden");
    expect(code(() => g.assertCanDelete(ctx(ana)))).toBe("ok");
    expect(code(() => g.assertCanDelete(ctx(mateo)))).toBe("ok");
  });

  it("drops members who left the trip", () => {
    const g = create("Carro 1", [ana, leo, caro]);
    expect(g.activeSeats(ctx(mateo, view((s) => (s.id === leo ? { active: false } : {}))))).toEqual([ana, caro]);
  });
});
