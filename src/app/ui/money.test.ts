import { describe, expect, it } from "vitest";
import { amountInput, parseAmount } from "./money";

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
