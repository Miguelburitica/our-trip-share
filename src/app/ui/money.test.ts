import { describe, expect, it } from "vitest";
import { amountInput, parseAmount, parseRate, rateInput, rateShort } from "./money";

describe("amount fields", () => {
  it("reads pesos with or without thousands dots", () => {
    expect(parseAmount("30.000", "COP")).toBe(30_000);
    expect(parseAmount("30000", "COP")).toBe(30_000);
    expect(parseAmount("", "COP")).toBeNull();
    expect(amountInput(30_000, "COP")).toBe("30.000");
  });

  it("reads decimals for currencies with cents", () => {
    expect(parseAmount("12,5", "USD")).toBe(1250);
    expect(parseAmount("12.05", "USD")).toBe(1205);
    expect(parseAmount("abc", "USD")).toBeNull();
    expect(amountInput(1250, "USD")).toBe("12.50");
  });
});

describe("Typed exchange rates", () => {
  it("reads Colombian number style: dots group thousands, comma for decimals", () => {
    expect(parseRate("3.900")).toBe("3900");
    expect(parseRate("3900")).toBe("3900");
    expect(parseRate("59,5")).toBe("59.5");
    expect(parseRate("4.215,75")).toBe("4215.75");
    expect(parseRate(" 0,0167 ")).toBe("0.0167");
    expect(parseRate("59,50")).toBe("59.5");
  });

  it("rejects what isn't a rate", () => {
    for (const bad of ["", "0", "0,00", "abc", "3.90", "-5", "1,2,3", "39.00.0"]) expect(parseRate(bad)).toBeNull();
  });

  it("writes a rate back the way it's typed", () => {
    expect(rateInput("3900")).toBe("3.900");
    expect(rateInput("59.5")).toBe("59,5");
    expect(rateShort("59.05285402")).toBe("59,05");
    expect(rateShort("3900")).toBe("3.900");
    expect(rateShort("0.016718544")).toBe("0,0167");
  });
});

