import { describe, expect, it } from "vitest";
import { daySummary } from "./day-summary";

const e = (at: string, base: number | null, extra: Partial<{ title: string; status: string; payer: string; type: string }> = {}) => ({
  status: extra.status ?? "complete",
  type: extra.type ?? "expense",
  title: extra.title ?? null,
  category: "comida",
  occurredAt: at,
  baseAmount: base,
  payers: [{ seatId: extra.payer ?? "ana" }],
});
const names: Record<string, string> = { ana: "Ana", leo: "Leo", juli: "Juli" };

describe("Daily summary card", () => {
  it("adds up the day in Bogotá, keeps the three biggest and orders people by how much they're off", () => {
    const s = daySummary(
      "2026-11-24",
      [
        e("2026-11-24T14:00:00-05:00", 60_000, { title: "Lancha", payer: "leo" }),
        e("2026-11-24T23:30:00-05:00", 20_000),
        e("2026-11-24T09:00:00-05:00", 120_000, { title: "Hotel" }),
        e("2026-11-24T12:00:00-05:00", 5_000, { title: "Agua" }),
        e("2026-11-25T00:30:00-05:00", 99_000, { title: "Otro día" }),
        e("2026-11-24T10:00:00-05:00", null, { title: "USD sin tasa" }),
        e("2026-11-24T11:00:00-05:00", 7_000, { status: "draft" }),
        e("2026-11-24T11:00:00-05:00", 50_000, { type: "money_received" }),
      ],
      [
        { seatId: "ana", balance: 30_000 },
        { seatId: "leo", balance: -80_000 },
        { seatId: "juli", balance: 50_000 },
      ],
      (id) => names[id],
    );
    expect(s).toEqual({
      day: "2026-11-24",
      total: 205_000,
      count: 5,
      pendingRate: 1,
      top: [
        { what: "Hotel", payer: "Ana", amount: 120_000 },
        { what: "Lancha", payer: "Leo", amount: 60_000 },
        { what: "Comida", payer: "Ana", amount: 20_000 },
      ],
      people: [
        { name: "Leo", balance: -80_000 },
        { name: "Juli", balance: 50_000 },
        { name: "Ana", balance: 30_000 },
      ],
      more: 0,
    });
  });
});
