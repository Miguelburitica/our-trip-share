import type { FxRateProvider } from "../application/ports";

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Free daily rates (fawazahmed0/exchange-api, no key; it has COP, unlike the ECB feeds). Asks for
 * the expense's date and falls back to the latest rates when that day isn't published yet. Only
 * the two currency codes and the date leave the server.
 */
export class CurrencyApiRateProvider implements FxRateProvider {
  private readonly send: Fetch;
  private readonly cache = new Map<string, string | null>();

  constructor(private readonly options: { timeoutMs?: number; fetch?: Fetch } = {}) {
    this.send = options.fetch ?? ((url, init) => fetch(url, init));
  }

  async rateFor(from: string, to: string, date: string): Promise<string | null> {
    const f = from.toLowerCase();
    const t = to.toLowerCase();
    if (f === t) return "1";
    const key = `${f}:${t}:${date}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const tags = ISO_DATE.test(date) ? [date, "latest"] : ["latest"];
    for (const tag of tags) {
      const rate = await this.fetchRate(f, t, tag);
      if (rate) {
        this.cache.set(key, rate);
        return rate;
      }
    }
    return null;
  }

  private async fetchRate(from: string, to: string, tag: string): Promise<string | null> {
    const urls = [
      `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${tag}/v1/currencies/${from}.min.json`,
      `https://${tag}.currency-api.pages.dev/v1/currencies/${from}.min.json`,
    ];
    for (const url of urls) {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), this.options.timeoutMs ?? 5_000);
      try {
        const res = await this.send(url, { signal: abort.signal });
        if (!res.ok) continue;
        const body = (await res.json()) as Record<string, unknown>;
        const value = (body[from] as Record<string, unknown> | undefined)?.[to];
        const decimal = toDecimal(value);
        if (decimal) return decimal;
      } catch {
        // Try the mirror, then the next tag.
      } finally {
        clearTimeout(timer);
      }
    }
    return null;
  }
}

/** The feed's float → a plain decimal with at most 8 decimals ("3572.87077188"); null if unusable. */
export function toDecimal(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const fixed = value.toFixed(8).replace(/\.?0+$/, "");
  return fixed === "0" ? null : fixed;
}
