import { CURRENCIES, isCurrencyCode } from "@/shared-kernel/money/currency";
import { formatMoney } from "@/shared-kernel/money/money";

/** "$184.000" for COP; falls back to plain numbers for unknown codes. */
export function fmt(units: number, currency: string): string {
  return isCurrencyCode(currency) ? formatMoney(units, currency) : String(units);
}

const exponentOf = (currency: string) => (isCurrencyCode(currency) ? CURRENCIES[currency].exponent : 0);

/** What a person typed in an amount field → stored units, or null. "30.000" in COP is 30000. */
export function parseAmount(text: string, currency: string): number | null {
  const exp = exponentOf(currency);
  if (exp === 0) {
    const digits = text.replace(/\D/g, "");
    return digits ? Number(digits) : null;
  }
  const m = /^(\d*)(?:[.,](\d*))?$/.exec(text.replace(/\s/g, ""));
  if (!m || (!m[1] && !m[2])) return null;
  return Number(m[1] || "0") * 10 ** exp + Number((m[2] ?? "").padEnd(exp, "0").slice(0, exp) || "0");
}

/**
 * A rate as typed in Colombia ("1 USD = 3.900" or "1 DOP = 59,5"): dots group thousands, the comma
 * is the decimal mark. Returns a plain decimal string ("3900", "59.5") or null.
 */
export function parseRate(text: string): string | null {
  const t = text.replace(/\s/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(t)) return null;
  const [whole, fraction = ""] = t.replace(/\./g, "").split(",");
  const trimmed = fraction.replace(/0+$/, "");
  if (trimmed.length > 8 || /^0+$/.test(whole + trimmed)) return null;
  return trimmed ? `${Number(whole)}.${trimmed}` : String(Number(whole));
}

/** "3900" → "3.900", "59.5" → "59,5" (how the person would type it back). */
export function rateInput(rate: string): string {
  const [whole, fraction] = rate.split(".");
  return Number(whole).toLocaleString("es-CO") + (fraction ? `,${fraction}` : "");
}

/** A rate to read, not to type: "59,05" (or "0,0167" below 1). */
export function rateShort(rate: string): string {
  const n = Number(rate);
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: n < 1 ? 4 : 2 }).format(n);
}

/** Units → what goes in an amount field ("30.000" in COP, "12.50" in USD). */
export function amountInput(units: number, currency: string): string {
  const exp = exponentOf(currency);
  if (exp === 0) return units.toLocaleString("es-CO");
  return (units / 10 ** exp).toFixed(exp);
}

/** For pasting into a bank or wallet app: no thousands separators ("641000", "12.50"). */
export function plainAmount(units: number, currency: string): string {
  const exp = exponentOf(currency);
  return exp === 0 ? String(units) : (units / 10 ** exp).toFixed(exp);
}

const dayFormat = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", timeZone: "America/Bogota" });

export function dayLabel(iso: string): string {
  const s = dayFormat.format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(iso));
}

const CATEGORY_LABEL: Record<string, string> = {
  comida: "Comida",
  transporte: "Transporte",
  super: "Súper",
  tragos: "Tragos",
  alojamiento: "Alojamiento",
  planes: "Planes",
  otro: "Otro",
};

/** Untitled expenses fall back to their category name (PRODUCT_SPEC §3.4). */
export function expenseTitle(e: { title: string | null; category: string; status: string }): string {
  if (e.title) return e.title;
  return e.status === "draft" ? "Recibo" : (CATEGORY_LABEL[e.category] ?? "Gasto");
}
