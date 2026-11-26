import { describe, expect, it } from "vitest";
import { DomainError } from "@/shared-kernel/errors";
import { SeatId } from "@/shared-kernel/ids";
import { handlesVisibleTo, normalizeHandles } from "./payout-handles";

const [mateo, juli, ana] = ["mateo", "juli", "ana"].map(SeatId);

describe("Payout handles", () => {
  it("cleans what people type and drops empty rows", () => {
    expect(normalizeHandles([{ kind: "breb", value: "  @mateo  " }, { kind: "nequi", value: "" }])).toEqual([{ kind: "breb", value: "@mateo" }]);
  });

  it("rejects unknown kinds, long values and more than 4", () => {
    expect(() => normalizeHandles([{ kind: "bitcoin", value: "x" }])).toThrow(DomainError);
    expect(() => normalizeHandles([{ kind: "otro", value: "x".repeat(81) }])).toThrow(DomainError);
    expect(() => normalizeHandles(Array.from({ length: 5 }, (_, i) => ({ kind: "otro", value: `${i}` })))).toThrow(DomainError);
  });

  it("shows someone's details only to people who owe them now", () => {
    const plan = [
      { from: juli, to: mateo, amount: 641_000 },
      { from: ana, to: mateo, amount: 0 },
    ];
    expect([...handlesVisibleTo(juli, plan)]).toEqual([mateo]);
    expect([...handlesVisibleTo(ana, plan)]).toEqual([]);
    expect([...handlesVisibleTo(mateo, plan)]).toEqual([]);
  });
});
