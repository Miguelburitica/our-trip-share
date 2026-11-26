import { PrincipalId, type SeatId, type TripId } from "@/shared-kernel/ids";
import type { Container } from "./container";

export const DEMO_PRINCIPAL = PrincipalId("demo-mateo");

const must = <T>(r: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!r.ok) throw r.error;
  return r.value;
};

/** Seeds the Cartagena trip used across the spec, the design and the tests. */
export async function seedCartagena(c: Container): Promise<TripId> {
  const trip = must(
    await c.membership.createTrip({
      principal: { id: DEMO_PRINCIPAL, kind: "user" },
      displayName: "Mateo",
      name: "Cartagena",
      baseCurrency: "COP",
      startDate: "2026-11-20",
      endDate: "2026-11-24",
      people: ["Ana", "Leo", "Caro", "Juli", "Andrés"],
    }),
  );
  const seat = (name: string) => trip.seats.find((s) => s.displayName === name)!.id as SeatId;
  const [mateo, ana, leo, caro, juli, andres] = ["Mateo", "Ana", "Leo", "Caro", "Juli", "Andrés"].map(seat);
  const all = [mateo, ana, leo, caro, juli, andres];
  const record = async (
    title: string,
    category: "alojamiento" | "comida" | "transporte" | "super" | "planes" | "tragos",
    payer: SeatId,
    amount: number,
    participants: SeatId[],
    occurredAt: string,
  ) =>
    must(
      await c.ledger.recordExpense(DEMO_PRINCIPAL, trip.id, {
        title,
        category,
        currency: "COP",
        amount,
        payers: [{ seatId: payer }],
        split: { method: "equal", participants },
        occurredAt: new Date(occurredAt),
      }),
    );

  await record("Airbnb Getsemaní", "alojamiento", mateo, 2_400_000, all, "2026-11-20T15:00:00-05:00");
  await record("Taxi aeropuerto", "transporte", leo, 84_000, [mateo, leo, caro, juli], "2026-11-21T09:30:00-05:00");
  await record("Súper Olímpica", "super", caro, 312_000, all, "2026-11-21T12:10:00-05:00");
  await record("Cena La Cevichería", "comida", ana, 540_000, all, "2026-11-21T21:40:00-05:00");
  await record("Lancha Islas del Rosario", "planes", andres, 900_000, all, "2026-11-22T08:00:00-05:00");
  await record("Cervezas Plaza Trinidad", "tragos", juli, 96_000, [juli, leo, andres, ana], "2026-11-22T13:20:00-05:00");
  return trip.id;
}
