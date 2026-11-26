import type { TripId } from "@/shared-kernel/ids";
import type { PlanSnapshotRepository } from "../application/ports";
import type { PlanSnapshot } from "../domain/plan";

export class InMemoryPlanSnapshotRepository implements PlanSnapshotRepository {
  private rows = new Map<TripId, PlanSnapshot>();

  async get(tripId: TripId) {
    const s = this.rows.get(tripId);
    return s ? structuredClone(s) : null;
  }

  async saveIfAbsent(tripId: TripId, snapshot: PlanSnapshot) {
    if (!this.rows.has(tripId)) this.rows.set(tripId, structuredClone(snapshot));
    return structuredClone(this.rows.get(tripId)!);
  }
}
