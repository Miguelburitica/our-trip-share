import type { SeatId, TripId } from "@/shared-kernel/ids";
import type { CurrencyCode } from "@/shared-kernel/money/currency";

/**
 * The ledger's own view of a trip (not trip-membership's model). Filled by the
 * MembershipReader port so this context never imports another context's domain.
 */
export interface LedgerTripView {
  readonly tripId: TripId;
  readonly status: "active" | "settling" | "closed";
  readonly baseCurrency: CurrencyCode;
  readonly seats: ReadonlyArray<{
    readonly id: SeatId;
    readonly active: boolean;
    readonly defaultExcluded: boolean;
    readonly isAdmin: boolean;
  }>;
}

export function defaultParticipants(view: LedgerTripView): SeatId[] {
  return view.seats.filter((s) => s.active && !s.defaultExcluded).map((s) => s.id);
}

export function isTripSeat(view: LedgerTripView, seatId: SeatId): boolean {
  return view.seats.some((s) => s.id === seatId);
}

export function isAdminSeat(view: LedgerTripView, seatId: SeatId): boolean {
  return view.seats.some((s) => s.id === seatId && s.isAdmin);
}
