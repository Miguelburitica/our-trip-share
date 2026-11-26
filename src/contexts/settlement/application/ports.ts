import type { NoticeId, PrincipalId, SeatId, SettlementId, TripId } from "@/shared-kernel/ids";
import type { CurrencyCode } from "@/shared-kernel/money/currency";
import type { BalanceNotice } from "../domain/balance-notice";
import type { LedgerEntry } from "../domain/ledger-entry";
import type { PayoutHandle } from "../domain/payout-handles";
import type { PlanSnapshot } from "../domain/plan";
import type { ShareReview } from "../domain/share-review";
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
  /** La vaca (its seat is among `seats`) and who keeps the money. */
  readonly pot?: { readonly seatId: SeatId; readonly holderSeatId: SeatId } | null;
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

/** The plan frozen when the trip entered Liquidando (R9). */
export interface PlanSnapshotRepository {
  get(tripId: TripId): Promise<PlanSnapshot | null>;
  /** Stores it unless one exists; returns the stored one either way. */
  saveIfAbsent(tripId: TripId, snapshot: PlanSnapshot): Promise<PlanSnapshot>;
}

/** "Revisa tu parte" answers, one per seat. */
export interface ShareReviewRepository {
  get(tripId: TripId, seatId: SeatId): Promise<ShareReview | null>;
  list(tripId: TripId): Promise<ShareReview[]>;
  set(review: ShareReview): Promise<void>;
}

/** The trip's read-only summary link ("Compartir resumen"). Server-only. */
export interface SummaryLinkRepository {
  get(tripId: TripId): Promise<string | null>;
  tripOf(token: string): Promise<TripId | null>;
  set(tripId: TripId, token: string | null): Promise<void>;
}
