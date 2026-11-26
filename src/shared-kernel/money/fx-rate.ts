import { validationError } from "../errors";
import { CURRENCIES, type CurrencyCode } from "./currency";
import { assertUnits } from "./money";

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;
const MAX_SCALE = 12;

/** Integer division rounded half-to-even, for any sign. */
export function divideHalfEven(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw validationError("Division by zero");
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const sign = numerator < 0n ? -1n : 1n;
  const n = numerator < 0n ? -numerator : numerator;
  let q = n / denominator;
  const r = n % denominator;
  const twice = r * 2n;
  if (twice > denominator || (twice === denominator && q % 2n === 1n)) q += 1n;
  return q * sign;
}

/**
 * An exchange rate "1 unit of FROM = rate units of TO" kept as a decimal
 * (numerator / 10^scale). Never a float.
 */
export class FxRate {
  private constructor(
    readonly numerator: bigint,
    readonly scale: number,
  ) {}

  static parse(value: string): FxRate {
    const match = DECIMAL.exec(value.trim());
    if (!match) throw validationError("FX rate must be a positive decimal", { rate: value });
    const fraction = (match[2] ?? "").replace(/0+$/, "");
    if (fraction.length > MAX_SCALE) throw validationError("FX rate has too many decimals", { rate: value });
    const numerator = BigInt(match[1] + fraction);
    if (numerator === 0n) throw validationError("FX rate must be greater than zero", { rate: value });
    return new FxRate(numerator, fraction.length);
  }

  static one(): FxRate {
    return new FxRate(1n, 0);
  }

  /**
   * Derives the rate from what the card actually charged:
   * rate = (charge / 10^toExp) / (amount / 10^fromExp), kept at `scale` decimals.
   */
  static fromCharge(
    amountUnits: number,
    from: CurrencyCode,
    chargeUnits: number,
    to: CurrencyCode,
    scale = 8,
  ): FxRate {
    assertUnits(amountUnits);
    assertUnits(chargeUnits);
    if (amountUnits <= 0 || chargeUnits <= 0) throw validationError("Amount and charge must be positive");
    const ef = BigInt(CURRENCIES[from].exponent);
    const et = BigInt(CURRENCIES[to].exponent);
    const numerator = divideHalfEven(
      BigInt(chargeUnits) * 10n ** ef * 10n ** BigInt(scale),
      BigInt(amountUnits) * 10n ** et,
    );
    if (numerator <= 0n) throw validationError("Derived FX rate is zero");
    return FxRate.normalized(numerator, scale);
  }

  private static normalized(numerator: bigint, scale: number): FxRate {
    while (scale > 0 && numerator % 10n === 0n) {
      numerator /= 10n;
      scale -= 1;
    }
    return new FxRate(numerator, scale);
  }

  isOne(): boolean {
    return this.numerator === 1n && this.scale === 0;
  }

  /** Converts `units` of FROM into units of TO, rounding half-to-even once. */
  convert(units: number, from: CurrencyCode, to: CurrencyCode): number {
    assertUnits(units);
    const ef = CURRENCIES[from].exponent;
    const et = CURRENCIES[to].exponent;
    const numerator = BigInt(units) * this.numerator * 10n ** BigInt(et);
    const denominator = 10n ** BigInt(ef + this.scale);
    const result = divideHalfEven(numerator, denominator);
    const n = Number(result);
    if (!Number.isSafeInteger(n)) throw validationError("Converted amount is too large");
    return n;
  }

  toString(): string {
    const digits = this.numerator.toString().padStart(this.scale + 1, "0");
    if (this.scale === 0) return digits;
    return `${digits.slice(0, -this.scale)}.${digits.slice(-this.scale)}`;
  }
}
