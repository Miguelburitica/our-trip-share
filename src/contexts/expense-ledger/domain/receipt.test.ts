import { describe, expect, it } from "vitest";
import { DomainError } from "@/shared-kernel/errors";
import { TripId } from "@/shared-kernel/ids";
import { assertReceiptPaths, decimalToUnits, prefillFromReading, type ReceiptReading } from "./receipt";

const reading = (r: Partial<ReceiptReading> = {}): ReceiptReading => ({
  isReceipt: true,
  total: "184000",
  currency: "COP",
  merchant: " La Cevichería ",
  date: "2026-11-21",
  category: "comida",
  ...r,
});

describe("Receipt reading → quick add", () => {
  it("converts decimals into each currency's units", () => {
    expect(decimalToUnits("184000", "COP")).toBe(184_000);
    expect(decimalToUnits("184000.4", "COP")).toBe(184_000);
    expect(decimalToUnits("42.5", "USD")).toBe(4250);
    expect(decimalToUnits("42.505", "USD")).toBe(4251);
    expect(decimalToUnits("1.250", "KWD")).toBe(1250);
    for (const bad of ["184.000,00", "$184.000", "-5", "0", "", "1e9"]) expect(decimalToUnits(bad, "COP")).toBeNull();
  });

  it("pre-fills amount, title and category from a COP receipt", () => {
    expect(prefillFromReading(reading(), "COP")).toEqual({
      amount: 184_000,
      currency: "COP",
      title: "La Cevichería",
      category: "comida",
      note: null,
    });
  });

  it("explains instead of guessing", () => {
    expect(prefillFromReading(null, "COP").note).toMatch(/No pude leer/);
    expect(prefillFromReading(reading({ isReceipt: false }), "COP").note).toMatch(/No parece/);
    const chf = prefillFromReading(reading({ total: "42.50", currency: "CHF" }), "COP");
    expect(chf).toMatchObject({ amount: null, currency: null, title: "La Cevichería", note: expect.stringMatching(/CHF/) });
    expect(prefillFromReading(reading({ total: null }), "COP")).toMatchObject({ amount: null, note: expect.stringMatching(/total/) });
    expect(prefillFromReading(reading({ category: "casino" }), "COP").category).toBeNull();
  });

  it("reads a receipt in another supported currency in that currency's units", () => {
    expect(prefillFromReading(reading({ total: "42.50", currency: "USD" }), "COP")).toMatchObject({ amount: 4250, currency: "USD", note: null });
  });

  it("only accepts receipt paths stored under the same trip", () => {
    expect(() => assertReceiptPaths(["t1/a.jpg"], TripId("t1"))).not.toThrow();
    expect(() => assertReceiptPaths(["t2/a.jpg"], TripId("t1"))).toThrow(DomainError);
    expect(() => assertReceiptPaths(["t1/../t2/a.jpg"], TripId("t1"))).toThrow(DomainError);
  });
});
