import Link from "next/link";
import { loadTrip } from "../data";
import { QuickAdd } from "./quick-add";

export default async function NuevoGasto({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId: raw } = await params;
  const { c, principal, tripId, trip } = await loadTrip(raw);
  if (trip.status === "closed") {
    return (
      <main className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 px-8 text-center">
        <h1 className="text-[22px] font-bold tracking-tight">El viaje está cerrado</h1>
        <p className="text-[15px] text-muted">Ya no se agregan gastos. Si falta algo, el organizador puede reabrirlo desde Cuentas.</p>
        <Link href={`/t/${tripId}/cuentas`} className="mt-2 flex min-h-12 items-center rounded-full bg-tint px-6 text-[15px] font-semibold">
          Ir a Cuentas
        </Link>
      </main>
    );
  }
  const [presets, balances] = await Promise.all([
    c.ledger.getQuickAddDefaults(principal, tripId),
    trip.pot ? c.settlement.getTripBalances(principal, tripId) : null,
  ]);
  if (!presets.ok) throw new Error("No pudimos preparar el registro");
  // La vaca can pay; quick add warns when it doesn't have enough.
  const pot = trip.pot && balances?.ok && balances.value.pot ? { id: trip.pot.seatId as string, cash: balances.value.pot.cash } : null;
  const people = trip.seats
    .filter((s) => s.status === "active" && !s.awaitingApproval)
    .map((s) => ({
      id: s.id as string,
      name: s.id === trip.mySeatId ? "Tú" : s.displayName,
      initials: s.displayName.slice(0, s.displayName.length > 4 && s.displayName.startsWith("An") ? 2 : 1),
    }));
  return (
    <QuickAdd
      tripId={trip.id}
      currency={trip.baseCurrency}
      mySeatId={trip.mySeatId}
      people={people}
      pot={pot}
      presets={presets.value}
    />
  );
}
