import { CURRENCIES, isCurrencyCode } from "@/shared-kernel/money/currency";

/**
 * CSV for spreadsheets in Spanish locales (Excel es-CO, Google Sheets): ";" between fields, decimal
 * comma, no thousands separators, UTF-8 with BOM so accents survive Excel.
 */
const SEP = ";";

/** Quotes when needed, and defuses formulas (=, +, -, @) that a spreadsheet would run. */
export function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Units → "25,50" / "184000". */
export function csvAmount(units: number | null, currency: string): string {
  if (units === null) return "";
  const exp = isCurrencyCode(currency) ? CURRENCIES[currency].exponent : 0;
  return exp === 0 ? String(units) : (units / 10 ** exp).toFixed(exp).replace(".", ",");
}

const CATEGORY: Record<string, string> = {
  comida: "Comida",
  transporte: "Transporte",
  super: "Súper",
  tragos: "Tragos",
  alojamiento: "Alojamiento",
  planes: "Planes",
  otro: "Otro",
};

export interface CsvExpense {
  occurredAt: string;
  title: string | null;
  category: string;
  type: "expense" | "money_received";
  status: string;
  currency: string | null;
  amount: number | null;
  baseAmount: number | null;
  fxRate: string | null;
  payers: Array<{ seatId: string }>;
  shares: Array<{ seatId: string; baseAmount: number | null }>;
}

const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" });

/** One row per expense, one column per person with their share in the trip's currency. */
export function expensesCsv(input: {
  baseCurrency: string;
  people: ReadonlyArray<{ id: string; name: string }>;
  nameOf: (seatId: string) => string;
  expenses: readonly CsvExpense[];
}): string {
  const { baseCurrency: base } = input;
  const header = [
    "Fecha",
    "Gasto",
    "Categoría",
    "Tipo",
    "Pagó",
    "Moneda",
    "Monto",
    "Tasa",
    `Monto ${base}`,
    ...input.people.map((p) => `Parte de ${p.name}`),
  ];
  const rows = [...input.expenses]
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .map((e) => {
      const share = (seatId: string) => e.shares.find((s) => s.seatId === seatId)?.baseAmount ?? null;
      return [
        day.format(new Date(e.occurredAt)),
        e.title ?? CATEGORY[e.category] ?? "Gasto",
        CATEGORY[e.category] ?? e.category,
        e.status === "draft" ? "Recibo sin monto" : e.type === "money_received" ? "Plata recibida" : "Gasto",
        e.payers.map((p) => input.nameOf(p.seatId)).join(" + "),
        e.currency ?? "",
        csvAmount(e.amount, e.currency ?? base),
        e.currency && e.currency !== base && e.fxRate ? e.fxRate.replace(".", ",") : "",
        csvAmount(e.baseAmount, base),
        ...input.people.map((p) => csvAmount(share(p.id), base)),
      ].map(cell);
    });
  return "﻿" + [header.map(cell), ...rows].map((r) => r.join(SEP)).join("\r\n") + "\r\n";
}
