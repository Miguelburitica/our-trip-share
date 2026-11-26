import { notFound } from "next/navigation";
import { expensesCsv } from "@/app/ui/csv";
import { requirePrincipal } from "@/composition/auth";
import { getContainer } from "@/composition/server";
import { TripId } from "@/shared-kernel/ids";

/** "Descargar gastos": the trip's expenses as CSV, for members only. */
export async function GET(_req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId: raw } = await params;
  const { id: principal } = await requirePrincipal(`/t/${raw}/gastos`);
  const c = await getContainer();
  const tripId = TripId(raw);
  const [trip, expenses] = await Promise.all([c.membership.getTrip(principal, tripId), c.ledger.listTripExpenses(principal, tripId)]);
  if (!trip.ok || !expenses.ok) notFound();
  const people = trip.value.seats.filter((s) => !s.awaitingApproval).map((s) => ({ id: s.id as string, name: s.displayName }));
  const names = new Map(people.map((p) => [p.id, p.name]));
  if (trip.value.pot) names.set(trip.value.pot.seatId, "La vaca");
  const csv = expensesCsv({
    baseCurrency: trip.value.baseCurrency,
    people,
    nameOf: (id) => names.get(id) ?? "Alguien",
    expenses: expenses.value,
  });
  const file = `${trip.value.name.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "viaje"} - gastos.csv`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="gastos.csv"; filename*=UTF-8''${encodeURIComponent(file)}`,
      "cache-control": "private, no-store",
    },
  });
}
