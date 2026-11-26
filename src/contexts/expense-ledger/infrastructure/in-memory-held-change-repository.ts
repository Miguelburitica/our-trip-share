import type { TripId } from "@/shared-kernel/ids";
import type { HeldChangeRepository } from "../application/ports";
import type { HeldChange } from "../domain/held-change";

export class InMemoryHeldChangeRepository implements HeldChangeRepository {
  private rows = new Map<string, HeldChange>();

  async add(change: HeldChange) {
    this.rows.set(change.id, structuredClone(change));
  }

  async get(tripId: TripId, id: string) {
    const c = this.rows.get(id);
    return c && c.tripId === tripId ? structuredClone(c) : null;
  }

  async list(tripId: TripId) {
    return [...this.rows.values()]
      .filter((c) => c.tripId === tripId)
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .map((c) => structuredClone(c));
  }

  async delete(tripId: TripId, id: string) {
    if (this.rows.get(id)?.tripId === tripId) this.rows.delete(id);
  }
}
