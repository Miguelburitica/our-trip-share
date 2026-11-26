import type { SeatId, TripId } from "@/shared-kernel/ids";
import type { PayoutHandleRepository } from "../application/ports";
import type { PayoutHandle } from "../domain/payout-handles";

export class InMemoryPayoutHandleRepository implements PayoutHandleRepository {
  private rows = new Map<string, PayoutHandle[]>();
  private key = (tripId: TripId, seatId: SeatId) => `${tripId}:${seatId}`;

  async get(tripId: TripId, seatId: SeatId) {
    return structuredClone(this.rows.get(this.key(tripId, seatId)) ?? []);
  }

  async getMany(tripId: TripId, seatIds: readonly SeatId[]) {
    return new Map(seatIds.map((id) => [id, structuredClone(this.rows.get(this.key(tripId, id)) ?? [])] as const));
  }

  async set(tripId: TripId, seatId: SeatId, handles: readonly PayoutHandle[]) {
    this.rows.set(this.key(tripId, seatId), structuredClone([...handles]));
  }
}
