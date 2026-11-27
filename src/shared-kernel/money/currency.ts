import { validationError } from "../errors";

export interface CurrencyInfo {
  readonly code: string;
  /** Decimals in the units we store and show (COP: 0 → whole pesos). */
  readonly exponent: number;
  /** ISO-4217 exponent, only for converting at external API edges. */
  readonly isoExponent: number;
  /** |balance| below this (in our units) counts as settled. */
  readonly dustTolerance: number;
}

export const CURRENCIES = {
  COP: { code: "COP", exponent: 0, isoExponent: 2, dustTolerance: 100 },
  USD: { code: "USD", exponent: 2, isoExponent: 2, dustTolerance: 5 },
  EUR: { code: "EUR", exponent: 2, isoExponent: 2, dustTolerance: 5 },
  MXN: { code: "MXN", exponent: 2, isoExponent: 2, dustTolerance: 100 },
  BRL: { code: "BRL", exponent: 2, isoExponent: 2, dustTolerance: 25 },
  PEN: { code: "PEN", exponent: 2, isoExponent: 2, dustTolerance: 20 },
  DOP: { code: "DOP", exponent: 2, isoExponent: 2, dustTolerance: 100 },
  JPY: { code: "JPY", exponent: 0, isoExponent: 0, dustTolerance: 10 },
  KWD: { code: "KWD", exponent: 3, isoExponent: 3, dustTolerance: 15 },
} as const satisfies Record<string, CurrencyInfo>;

export type CurrencyCode = keyof typeof CURRENCIES;

export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, value);
}

export function currency(code: string): CurrencyInfo {
  if (!isCurrencyCode(code)) throw validationError(`Unsupported currency ${code}`, { currency: code });
  return CURRENCIES[code];
}

/** Converts our stored units to ISO-4217 minor units (for payment/FX APIs). */
export function toIsoMinorUnits(units: number, code: CurrencyCode): number {
  const c = CURRENCIES[code];
  return units * 10 ** (c.isoExponent - c.exponent);
}
