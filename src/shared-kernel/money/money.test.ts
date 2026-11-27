import { describe, expect, it } from "vitest";
import { allocate, splitEqually } from "./allocate";
import { FxRate, divideHalfEven } from "./fx-rate";
import { assertUnits, formatMoney, isWithinDust, sum } from "./money";
import { toIsoMinorUnits } from "./currency";

describe("integer currency units", () => {
  it("accepts 184.000 COP as the integer 184000", () => {
    expect(assertUnits(184000)).toBe(184000);
  });
  it("rejects fractional COP", () => {
    expect(() => assertUnits(184000.5)).toThrowError(/integer/);
  });
  it("rejects non-finite values", () => {
    expect(() => assertUnits(Number.NaN)).toThrow();
    expect(() => assertUnits(Number.POSITIVE_INFINITY)).toThrow();
  });
  it("converts COP to ISO minor units only at the edge", () => {
    expect(toIsoMinorUnits(184000, "COP")).toBe(18400000);
  });
  it("formats es-CO pesos", () => {
    expect(formatMoney(184000, "COP")).toBe("$184.000");
    expect(formatMoney(-641000, "COP")).toBe("−$641.000");
    expect(formatMoney(150050, "DOP")).toBe("RD$1.500,50");
  });
  it("applies dust tolerance per currency", () => {
    expect(isWithinDust(-40, "COP")).toBe(true);
    expect(isWithinDust(-100, "COP")).toBe(false);
    expect(isWithinDust(4, "USD")).toBe(true);
  });
});

describe("allocate", () => {
  it("splits 540.000 among 6 as 90.000 each", () => {
    expect(splitEqually(540000, ["a", "b", "c", "d", "e", "f"])).toEqual(Array(6).fill(90000));
  });

  it("splits 100.000 among 3 as 33.333/33.333/33.334", () => {
    const shares = splitEqually(100000, ["x:1", "x:2", "x:3"]);
    expect(sum(shares)).toBe(100000);
    expect([...shares].sort()).toEqual([33333, 33333, 33334]);
  });

  it("is deterministic for the same keys", () => {
    const keys = ["exp-9:ana", "exp-9:leo", "exp-9:caro"];
    expect(splitEqually(100, keys)).toEqual(splitEqually(100, keys));
  });

  it("allocates proportionally to weights", () => {
    expect(allocate(1000, [1, 3], ["a", "b"])).toEqual([250, 750]);
  });

  it("never gives remainder units to zero weights", () => {
    const shares = allocate(10, [0, 1, 1, 1], ["z", "a", "b", "c"]);
    expect(shares[0]).toBe(0);
    expect(sum(shares)).toBe(10);
  });

  it("negates negative totals", () => {
    const shares = splitEqually(-100, ["a", "b", "c"]);
    expect(sum(shares)).toBe(-100);
    expect([...shares].sort((a, b) => a - b)).toEqual([-34, -33, -33]);
  });

  it("always sums exactly over random inputs", () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed;
    };
    for (let run = 0; run < 500; run++) {
      const n = 1 + (rand() % 12);
      const total = rand() % 50_000_000;
      const weights = Array.from({ length: n }, () => rand() % 1000);
      if (!weights.some((w) => w > 0)) weights[0] = 1;
      const keys = weights.map((_, i) => `k${run}:${i}`);
      expect(sum(allocate(total, weights, keys))).toBe(total);
    }
  });

  it("rejects bad input", () => {
    expect(() => allocate(10, [], [])).toThrow();
    expect(() => allocate(10, [0, 0], ["a", "b"])).toThrow();
    expect(() => allocate(10, [-1, 2], ["a", "b"])).toThrow();
  });
});

describe("FxRate", () => {
  it("converts 100.00 USD at 4123.7 to 412.370 COP", () => {
    expect(FxRate.parse("4123.7").convert(10000, "USD", "COP")).toBe(412370);
  });

  it("rounds half to even (0.05 USD at 10 → 0 COP)", () => {
    expect(FxRate.parse("10").convert(5, "USD", "COP")).toBe(0);
    expect(FxRate.parse("10").convert(15, "USD", "COP")).toBe(2);
  });

  it("same currency is identity", () => {
    expect(FxRate.one().convert(184000, "COP", "COP")).toBe(184000);
  });

  it("derives the rate from a card charge", () => {
    const rate = FxRate.fromCharge(10000, "EUR", 486000, "COP");
    expect(rate.toString()).toBe("4860");
    expect(rate.convert(10000, "EUR", "COP")).toBe(486000);
  });

  it("round-trips its decimal string", () => {
    expect(FxRate.parse("4123.70").toString()).toBe("4123.7");
    expect(FxRate.parse("0.00025").toString()).toBe("0.00025");
  });

  it("rejects invalid rates", () => {
    expect(() => FxRate.parse("0")).toThrow();
    expect(() => FxRate.parse("-3")).toThrow();
    expect(() => FxRate.parse("abc")).toThrow();
  });

  it("divides half-even for negatives", () => {
    expect(divideHalfEven(-5n, 10n)).toBe(0n);
    expect(divideHalfEven(-15n, 10n)).toBe(-2n);
    expect(divideHalfEven(-16n, 10n)).toBe(-2n);
  });
});
