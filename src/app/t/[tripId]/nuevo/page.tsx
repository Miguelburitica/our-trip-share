import { loadTrip } from "../data";
import { QuickAdd } from "./quick-add";

export default async function NuevoGasto({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId: raw } = await params;
  const { trip } = await loadTrip(raw);
  const people = trip.seats
    .filter((s) => s.status === "active")
    .map((s) => ({
      id: s.id as string,
      name: s.id === trip.mySeatId ? "Tú" : s.displayName,
      initials: s.displayName.slice(0, s.displayName.length > 4 && s.displayName.startsWith("An") ? 2 : 1),
      defaultIn: !s.defaultExcluded,
    }));
  return <QuickAdd tripId={trip.id} currency={trip.baseCurrency} mySeatId={trip.mySeatId} people={people} />;
}
