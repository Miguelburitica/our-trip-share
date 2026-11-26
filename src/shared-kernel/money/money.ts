import { validationError } from "../errors";
import { CURRENCIES, type CurrencyCode } from "./currency";

/** An amount in our currency-table units (always an integer). */
export interface Money {
  readonly units: number;
  readonly currency: CurrencyCode;
}

export function assertUnits(value: number, label = "amount"): number {
  if (!Number.isSafeInteger(value)) {
    throw validationError(`${label} must be an integer in currency units`, { [label]: value });
  }
  return value;
}

export function money(units: number, currency: CurrencyCode): Money {
  return { units: assertUnits(units), currency };
}

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export function isWithinDust(units: number, code: CurrencyCode): boolean {
  return Math.abs(units) < CURRENCIES[code].dustTolerance;
}

/** "$184.000" in es-CO, "US$100.00" style for others. Presentation helper kept here so every screen agrees. */
export function formatMoney(units: number, code: CurrencyCode, locale = "es-CO"): string {
  const { exponent } = CURRENCIES[code];
  const value = units / 10 ** exponent;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(Math.abs(value));
  const sign = units < 0 ? "−" : "";
  const symbol = code === "COP" ? "$" : code === "USD" ? "US$" : `${code} `;
  return `${sign}${symbol}${formatted}`;
}
