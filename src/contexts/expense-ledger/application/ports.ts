import type { ExpenseId, PrincipalId, SeatId, SplitGroupId, TripId } from "@/shared-kernel/ids";
import type { Expense } from "../domain/expense";
import type { SplitGroup } from "../domain/split-group";
import type { LedgerTripView } from "../domain/trip-view";

export interface ExpenseRepository {
  get(id: ExpenseId): Promise<Expense | null>;
  /** Must reject the write if the stored money version is not `expectedMoneyVersion` (conflict). */
  save(expense: Expense, expectedMoneyVersion: number | null): Promise<void>;
  listByTrip(tripId: TripId): Promise<Expense[]>;
}

/** The ledger's port onto trip-membership. */
export interface MembershipReader {
  getTripView(tripId: TripId): Promise<LedgerTripView | null>;
  seatOf(tripId: TripId, principalId: PrincipalId): Promise<SeatId | null>;
}

export interface SplitGroupRepository {
  listByTrip(tripId: TripId): Promise<SplitGroup[]>;
  /** Inserts a new group; a duplicate name in the trip is a validation error. */
  add(group: SplitGroup): Promise<void>;
  delete(tripId: TripId, id: SplitGroupId): Promise<void>;
}
