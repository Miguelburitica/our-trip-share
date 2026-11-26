import type { ExpenseId, PrincipalId, SeatId, SplitGroupId, TripId } from "@/shared-kernel/ids";
import type { Category, Expense, ExpenseEffect } from "../domain/expense";
import type { HeldChange } from "../domain/held-change";
import type { ReceiptImage, ReceiptReading } from "../domain/receipt";
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

/** Published after a money change is saved, so other contexts can react (settlement: R14 notices). */
export interface ExpenseMoneyChanged {
  tripId: TripId;
  expenseId: ExpenseId;
  kind: "created" | "edited" | "deleted";
  title: string | null;
  category: Category;
  by: SeatId;
  at: Date;
  before: ExpenseEffect | null;
  after: ExpenseEffect | null;
}

export interface LedgerEventPublisher {
  moneyChanged(event: ExpenseMoneyChanged): Promise<void>;
}

/** Where receipt photos live (private). Paths are `<tripId>/<id>.<ext>`. */
export interface ReceiptStore {
  put(tripId: TripId, id: string, image: ReceiptImage): Promise<string>;
  /** A short-lived URL to show the photo, or null if it's gone. */
  signedUrl(path: string): Promise<string | null>;
}

/** Reads a receipt photo (a vision model). May be absent when not configured. */
export interface ReceiptReader {
  read(image: ReceiptImage, hint: { baseCurrency: string }): Promise<ReceiptReading | null>;
}

/**
 * Daily exchange rates for an expense's date. Returns "1 FROM = rate TO" as a plain decimal
 * string, or null when no rate can be had (the expense is then saved as "tasa pendiente").
 */
export interface FxRateProvider {
  rateFor(from: string, to: string, date: string): Promise<string | null>;
}

/** Changes waiting for an admin's approval (R14 during Liquidando). */
export interface HeldChangeRepository {
  add(change: HeldChange): Promise<void>;
  get(tripId: TripId, id: string): Promise<HeldChange | null>;
  list(tripId: TripId): Promise<HeldChange[]>;
  delete(tripId: TripId, id: string): Promise<void>;
}

/** Answered by settlement: would this change move the balance of someone who already settled? */
export interface ReopenCheck {
  reopens(change: ExpenseMoneyChanged): Promise<boolean>;
}
