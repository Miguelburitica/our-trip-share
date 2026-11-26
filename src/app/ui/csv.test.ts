import { describe, expect, it } from "vitest";
import { cell, csvAmount, expensesCsv } from "./csv";

describe("expensesCsv", () => {
  it("writes one row per expense with each person's share", () => {
    const csv = expensesCsv({
      baseCurrency: "COP",
      people: [
        { id: "a", name: "Ana" },
        { id: "l", name: "Leo" },
      ],
      nameOf: (id) => ({ a: "Ana", l: "Leo", v: "La vaca" })[id] ?? "?",
      expenses: [
        {
          occurredAt: "2026-11-22T02:00:00Z",
          title: "Cena; postre",
          category: "comida",
          type: "expense",
          status: "complete",
          currency: "USD",
          amount: 2550,
          baseAmount: 102000,
          fxRate: "4000",
          payers: [{ seatId: "v" }],
          shares: [
            { seatId: "a", baseAmount: 51000 },
            { seatId: "l", baseAmount: 51000 },
          ],
        },
      ],
    });
    const lines = csv.replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe("Fecha;Gasto;Categoría;Tipo;Pagó;Moneda;Monto;Tasa;Monto COP;Parte de Ana;Parte de Leo");
    // 21:00 in Bogotá on the 21st.
    expect(lines[1]).toBe('2026-11-21;"Cena; postre";Comida;Gasto;La vaca;USD;25,50;4000;102000;51000;51000');
  });

  it("defuses formulas and quotes separators", () => {
    expect(cell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(cell('dijo "hola"')).toBe('"dijo ""hola"""');
    expect(cell("a;b")).toBe('"a;b"');
    expect(csvAmount(-500, "COP")).toBe("-500");
  });
});
