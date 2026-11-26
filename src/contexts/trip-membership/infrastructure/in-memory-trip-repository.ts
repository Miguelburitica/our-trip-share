import { DomainError } from "@/shared-kernel/errors";
import type { PrincipalId, TripId } from "@/shared-kernel/ids";
import type { TripRepository } from "../application/ports";
import { Trip, type TripProps } from "../domain/trip";

/** Stores primitives (not live objects) so it behaves like a real database. */
export class InMemoryTripRepository implements TripRepository {
  private rows = new Map<TripId, TripProps>();

  async get(id: TripId) {
    const row = this.rows.get(id);
    return row ? Trip.fromPrimitives(structuredClone(row)) : null;
  }

  async save(trip: Trip) {
    const next = trip.toPrimitives();
    // Emulates the DB unique index on (trip_id, principal_id) and the claim compare-and-set.
    const principals = next.seats.flatMap((s) => (s.link.kind === "none" ? [] : [s.link.principalId]));
    if (new Set(principals).size !== principals.length) {
      throw new DomainError("already_claimed", "Este lugar ya fue reclamado");
    }
    this.rows.set(next.id, structuredClone(next));
  }

  async listForPrincipal(principalId: PrincipalId) {
    return [...this.rows.values()]
      .filter((t) => t.seats.some((s) => s.link.kind !== "none" && s.link.principalId === principalId))
      .map((t) => Trip.fromPrimitives(structuredClone(t)));
  }
}
