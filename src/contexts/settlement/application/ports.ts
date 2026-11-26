import type { NoticeId, PrincipalId, SeatId, SettlementId, TripId } from "@/shared-kernel/ids";
import type { CurrencyCode } from "@/shared-kernel/money/currency";
import type { BalanceNotice } from "../domain/balance-notice";
import type { LedgerEntry } from "../domain/ledger-entry";
import type { PayoutHandle } from "../domain/payout-handles";
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

export interface BalanceNoticeRepository {
  add(notices: readonly BalanceNotice[]): Promise<void>;
  get(id: NoticeId): Promise<BalanceNotice | null>;
  save(notice: BalanceNotice): Promise<void>;
  /** Not yet dismissed, newest first. */
  listOpen(tripId: TripId, seatId: SeatId): Promise<BalanceNotice[]>;
}

/** Each seat's "cómo me pagan" (Bre-B key, Nequi…). Private: see payout-handles.ts. */
export interface PayoutHandleRepository {
  get(tripId: TripId, seatId: SeatId): Promise<PayoutHandle[]>;
  getMany(tripId: TripId, seatIds: readonly SeatId[]): Promise<Map<SeatId, PayoutHandle[]>>;
  set(tripId: TripId, seatId: SeatId, handles: readonly PayoutHandle[]): Promise<void>;
}
