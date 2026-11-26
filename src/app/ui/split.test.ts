import { describe, expect, it } from "vitest";
import { rebalance, type SplitRow } from "./split";

const row = (seatId: string, fixed: number | null = null, included = true): SplitRow => ({ seatId, fixed, included });
const obj = (m: Map<string, number>) => Object.fromEntries(m);

describe("Editar reparto", () => {
  it("splits equally when nobody typed an amount, leftovers to the first", () => {
    expect(rebalance(100_000, [row("a"), row("b"), row("c")])).toEqual({
      amounts: new Map([["a", 33_334], ["b", 33_333], ["c", 33_333]]),
      remainder: 0,
    });
  });

  it("keeps what I typed and rebalances the rest", () => {
    const r = rebalance(184_000, [row("ana", 30_000), row("mateo"), row("juli"), row("caro", null, false)]);
    expect(obj(r.amounts)).toEqual({ ana: 30_000, mateo: 77_000, juli: 77_000 });
    expect(r.remainder).toBe(0);
  });

  it("reports what's missing or over when everyone is typed by hand", () => {
    expect(rebalance(100, [row("a", 40), row("b", 50)]).remainder).toBe(10);
    expect(rebalance(100, [row("a", 80), row("b", 50)]).remainder).toBe(-30);
    const over = rebalance(100, [row("a", 120), row("b")]);
    expect(over.remainder).toBe(-20);
    expect(over.amounts.get("b")).toBe(0);
  });
});
