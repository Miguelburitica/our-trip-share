import type { SeatId, SettlementId, TripId } from "@/shared-kernel/ids";
import type { SettlementRepository } from "../application/ports";
import { Settlement, type SettlementProps } from "../domain/settlement";

export class InMemorySettlementRepository implements SettlementRepository {
  private rows = new Map<SettlementId, SettlementProps>();

  async get(id: SettlementId) {
    const row = this.rows.get(id);
    return row ? Settlement.fromPrimitives(structuredClone(row)) : null;
  }

  async save(settlement: Settlement) {
    this.rows.set(settlement.id, structuredClone(settlement.toPrimitives()));
  }

  async listByTrip(tripId: TripId) {
    return [...this.rows.values()]
      .filter((r) => r.tripId === tripId)
      .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())
      .map((r) => Settlement.fromPrimitives(structuredClone(r)));
  }

  async hasSettlements(tripId: TripId) {
    return [...this.rows.values()].some((r) => r.tripId === tripId);
  }

  async isSeatUsed(tripId: TripId, seatId: SeatId) {
    return [...this.rows.values()].some((r) => r.tripId === tripId && (r.from === seatId || r.to === seatId));
  }
}
