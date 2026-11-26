import { validationError } from "@/shared-kernel/errors";
import type { SplitGroupId, TripId } from "@/shared-kernel/ids";
import type { SplitGroupRepository } from "../application/ports";
import { SplitGroup, type SplitGroupProps } from "../domain/split-group";

export class InMemorySplitGroupRepository implements SplitGroupRepository {
  private rows = new Map<SplitGroupId, SplitGroupProps>();

  async listByTrip(tripId: TripId) {
    return [...this.rows.values()]
      .filter((r) => r.tripId === tripId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((r) => SplitGroup.fromPrimitives(structuredClone(r)));
  }

  async add(group: SplitGroup) {
    const g = group.toPrimitives();
    const taken = [...this.rows.values()].some(
      (r) => r.tripId === g.tripId && r.name.toLocaleLowerCase("es") === g.name.toLocaleLowerCase("es"),
    );
    if (taken || this.rows.has(g.id)) throw validationError("Ya hay un grupo con ese nombre");
    this.rows.set(g.id, structuredClone(g));
  }

  async delete(tripId: TripId, id: SplitGroupId) {
    if (this.rows.get(id)?.tripId === tripId) this.rows.delete(id);
  }
}
