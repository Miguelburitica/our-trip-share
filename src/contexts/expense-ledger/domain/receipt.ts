import { validationError } from "@/shared-kernel/errors";
import type { TripId } from "@/shared-kernel/ids";
import { CURRENCIES, isCurrencyCode, type CurrencyCode } from "@/shared-kernel/money/currency";
import { CATEGORIES, type Category } from "./expense";

export const RECEIPT_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ReceiptMediaType = (typeof RECEIPT_MEDIA_TYPES)[number];
export const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;

export interface ReceiptImage {
  readonly bytes: Uint8Array;
  readonly mediaType: ReceiptMediaType;
}

/** What a reader (OCR / vision model) found on the photo. Every field is a guess and may be null. */
export interface ReceiptReading {
  readonly isReceipt: boolean;
  /** Plain decimal with "." as separator, e.g. "184000" or "42.50". */
  readonly total: string | null;
  readonly currency: string | null;
  readonly merchant: string | null;
  /** YYYY-MM-DD */
  readonly date: string | null;
  readonly category: string | null;
}

/** What quick add pre-fills from a reading. The person always reviews before saving. */
export interface ReceiptPrefill {
  amount: number | null;
  currency: CurrencyCode | null;
  title: string | null;
  category: Category | null;
  /** Set when something was read but can't be used as is. */
  note: string | null;
}

export function assertReceiptImage(image: ReceiptImage): void {
  if (!(RECEIPT_MEDIA_TYPES as readonly string[]).includes(image.mediaType)) throw validationError("Sube una foto (JPG, PNG o WebP)");
  if (image.bytes.byteLength === 0 || image.bytes.byteLength > MAX_RECEIPT_BYTES) throw validationError("La foto pesa demasiado");
}

/** Receipts are stored under their trip, so a path is only ever attached to that trip's expenses. */
export const receiptPrefix = (tripId: TripId) => `${tripId}/`;

export function assertReceiptPaths(paths: readonly string[], tripId: TripId): void {
  if (paths.length > 5) throw validationError("Máximo 5 fotos por gasto");
  const prefix = receiptPrefix(tripId);
  if (paths.some((p) => !p.startsWith(prefix) || p.includes(".."))) throw validationError("Ese soporte no es de este viaje");
}

/** "184000" / "42.50" → stored units for the currency; null if it isn't a clean positive amount. */
export function decimalToUnits(total: string, code: CurrencyCode): number | null {
  const m = /^(\d{1,12})(?:\.(\d+))?$/.exec(total.trim());
  if (!m) return null;
  const exponent = CURRENCIES[code].exponent;
  const fraction = (m[2] ?? "").padEnd(exponent + 1, "0");
  let units = Number(m[1]) * 10 ** exponent + Number(fraction.slice(0, exponent) || "0");
  if (Number(fraction[exponent]) >= 5) units += 1; // the digit past the currency's precision
  return units > 0 && Number.isSafeInteger(units) ? units : null;
}

/** Turns a reading into quick-add fields for a trip whose expenses are in `baseCurrency`. */
export function prefillFromReading(reading: ReceiptReading | null, baseCurrency: CurrencyCode): ReceiptPrefill {
  const empty: ReceiptPrefill = { amount: null, currency: null, title: null, category: null, note: null };
  if (!reading) return { ...empty, note: "No pude leer la factura. Escribe el monto." };
  if (!reading.isReceipt) return { ...empty, note: "No parece una factura. Escribe el monto." };
  const code = reading.currency?.toUpperCase() ?? baseCurrency;
  const currency = isCurrencyCode(code) ? code : null;
  const title = reading.merchant?.trim().slice(0, 80) || null;
  const category = (CATEGORIES as readonly string[]).includes(reading.category ?? "") ? (reading.category as Category) : null;
  if (!currency || currency !== baseCurrency) {
    return { ...empty, title, category, currency, note: `La factura está en ${code}. Por ahora escribe el monto en ${baseCurrency}.` };
  }
  const amount = reading.total ? decimalToUnits(reading.total, currency) : null;
  return { amount, currency, title, category, note: amount === null ? "No encontré el total. Escríbelo." : null };
}
