import "server-only";
import { notFound } from "next/navigation";
import { requirePrincipal } from "@/composition/auth";
import { getContainer } from "@/composition/server";
import { TripId } from "@/shared-kernel/ids";

/** Loads what every trip screen needs, or 404s if the caller isn't a member. */
export async function loadTrip(rawTripId: string) {
  const { id: principal, kind } = await requirePrincipal(`/t/${rawTripId}`);
  const c = await getContainer();
  const tripId = TripId(rawTripId);
  const trip = await c.membership.getTrip(principal, tripId);
  if (!trip.ok) notFound();
  const names = new Map(trip.value.seats.map((s) => [s.id as string, s.displayName]));
  const nameOf = (seatId: string) => (seatId === trip.value.mySeatId ? "Tú" : (names.get(seatId) ?? "Alguien"));
  return { c, principal, isGuest: kind === "guest", tripId, trip: trip.value, nameOf };
}
