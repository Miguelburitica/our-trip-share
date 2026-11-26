import { describe, expect, it } from "vitest";
import { CurrencyApiRateProvider, toDecimal } from "./currency-api-rate-provider";

const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

describe("CurrencyApiRateProvider", () => {
  it("asks for the expense's day and returns a plain decimal", async () => {
    const urls: string[] = [];
    const p = new CurrencyApiRateProvider({
      fetch: async (url) => {
        urls.push(url);
        return json({ date: "2026-11-24", usd: { cop: 3572.870771884 } });
      },
    });
    expect(await p.rateFor("USD", "COP", "2026-11-24")).toBe("3572.87077188");
    expect(urls[0]).toContain("currency-api@2026-11-24/v1/currencies/usd.min.json");
    // Cached per day.
    await p.rateFor("USD", "COP", "2026-11-24");
    expect(urls).toHaveLength(1);
  });

  it("falls back to the mirror, then to the latest rates", async () => {
    const urls: string[] = [];
    const p = new CurrencyApiRateProvider({
      fetch: async (url) => {
        urls.push(url);
        if (url.includes("latest")) return json({ eur: { cop: 4400.5 } });
        return json({}, false);
      },
    });
    expect(await p.rateFor("EUR", "COP", "2026-11-26")).toBe("4400.5");
    expect(urls).toHaveLength(3);
  });

  it("gives up with null when nothing answers", async () => {
    const p = new CurrencyApiRateProvider({ fetch: async () => { throw new Error("offline"); } });
    expect(await p.rateFor("USD", "COP", "2026-11-24")).toBeNull();
  });

  it("only turns positive finite numbers into rates", () => {
    expect(toDecimal(0.000000001)).toBeNull();
    expect(toDecimal(-1)).toBeNull();
    expect(toDecimal("3500")).toBeNull();
    expect(toDecimal(1)).toBe("1");
  });
});
