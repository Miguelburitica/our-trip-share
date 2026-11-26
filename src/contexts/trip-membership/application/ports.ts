import type { PrincipalId, SeatId, TripId } from "@/shared-kernel/ids";
import type { Trip } from "../domain/trip";

export interface TripRepository {
  get(id: TripId): Promise<Trip | null>;
  /** Persists the aggregate. Implementations must reject a seat claimed concurrently (AlreadyClaimed). */
  save(trip: Trip): Promise<void>;
  listForPrincipal(principalId: PrincipalId): Promise<Trip[]>;
}

/** Answered by the expense-ledger and settlement contexts. */
export interface SeatUsage {
  isSeatUsed(tripId: TripId, seatId: SeatId): Promise<boolean>;
}

/** Answered by the settlement context. */
export interface SettlementPresence {
  hasSettlements(tripId: TripId): Promise<boolean>;
}

/** Issues invite tokens; only hashes are stored. */
export interface TokenService {
  issue(): { token: string; hash: string };
  hash(token: string): string;
}
