import type { PrincipalId, SeatId, SettlementId, TripId } from "@/shared-kernel/ids";
import type { CurrencyCode } from "@/shared-kernel/money/currency";
import type { LedgerEntry } from "../domain/ledger-entry";
import type { Settlement } from "../domain/settlement";

export interface SettlementRepository {
  get(id: SettlementId): Promise<Settlement | null>;
  save(settlement: Settlement): Promise<void>;
  listByTrip(tripId: TripId): Promise<Settlement[]>;
}

/** Settlement's port onto the expense ledger (anti-corruption layer). */
export interface LedgerReader {
  entries(tripId: TripId): Promise<LedgerEntry[]>;
}

/** Settlement's own view of the trip. */
export interface SettlementTripView {
  readonly tripId: TripId;
  readonly status: "active" | "settling" | "closed";
  readonly baseCurrency: CurrencyCode;
  readonly settleMode: "simplified" | "hub" | "direct";
  readonly hubSeatId: SeatId | null;
  readonly seats: ReadonlyArray<{ readonly id: SeatId; readonly isAdmin: boolean }>;
}

export interface SettlementMembershipReader {
  getTripView(tripId: TripId): Promise<SettlementTripView | null>;
  seatOf(tripId: TripId, principalId: PrincipalId): Promise<SeatId | null>;
}
