import { isCurrencyCode } from "@/shared-kernel/money/currency";
import { formatMoney } from "@/shared-kernel/money/money";

/** "$184.000" for COP; falls back to plain numbers for unknown codes. */
export function fmt(units: number, currency: string): string {
  return isCurrencyCode(currency) ? formatMoney(units, currency) : String(units);
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
