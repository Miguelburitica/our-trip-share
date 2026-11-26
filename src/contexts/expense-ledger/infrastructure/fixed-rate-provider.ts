import type { FxRateProvider } from "../application/ports";

/** Deterministic rates for tests and offline demos: "USD:COP" → "4000". */
export class FixedRateProvider implements FxRateProvider {
  constructor(private readonly rates: Record<string, string> = { "USD:COP": "4000", "EUR:COP": "4400" }) {}

  async rateFor(from: string, to: string) {
    if (from === to) return "1";
    return this.rates[`${from}:${to}`] ?? null;
  }
}
