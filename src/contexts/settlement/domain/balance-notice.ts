import { forbidden } from "@/shared-kernel/errors";
import type { ExpenseId, NoticeId, SeatId, TripId } from "@/shared-kernel/ids";
import { ledgerBalances } from "./balances";
import type { LedgerEntry, SettlementLike } from "./ledger-entry";

export interface ChangeCause {
  readonly kind: "created" | "edited" | "deleted";
  readonly expenseId: ExpenseId;
  readonly title: string | null;
  readonly category: string;
}

/** A money change in the ledger, as settlement sees it: the expense's effect before and after. */
export interface LedgerChange {
  readonly tripId: TripId;
  readonly cause: ChangeCause;
  readonly by: SeatId;
  readonly at: Date;
  /** null when the expense didn't count before (new, or a draft). */
  readonly before: LedgerEntry | null;
  /** null when it no longer counts (deleted). */
  readonly after: LedgerEntry | null;
}

export interface BalanceNoticeProps {
  id: NoticeId;
  tripId: TripId;
  seatId: SeatId;
  /** Change to the seat's balance in base units: negative means they now owe more. */
  delta: number;
  cause: ChangeCause;
  by: SeatId;
  createdAt: Date;
  dismissedAt: Date | null;
}

/** How one change moves each seat's balance. Seats it doesn't move are left out. */
export function balanceDeltas(before: LedgerEntry | null, after: LedgerEntry | null): Map<SeatId, number> {
  const seats = [...new Set([before, after].flatMap((e) => (e ? [...e.payers, ...e.shares].map((x) => x.seatId) : [])))];
  const was = ledgerBalances(seats, before ? [before] : []);
  const now = ledgerBalances(seats, after ? [after] : []);
  return new Map(seats.map((id) => [id, (now.get(id) ?? 0) - (was.get(id) ?? 0)] as const).filter(([, d]) => d !== 0));
}

/**
 * R14 "Tu saldo cambió": a money change that moves the balance of someone who already has a
 * confirmed settlement reopens what they thought was settled, so they get a notice. The person who
 * made the change isn't notified about their own edit.
 */
export function detectReopened(
  change: LedgerChange,
  settlements: readonly SettlementLike[],
  nextId: () => NoticeId,
): BalanceNotice[] {
  const settled = new Set(settlements.filter((s) => s.status === "confirmed").flatMap((s) => [s.from, s.to]));
  return [...balanceDeltas(change.before, change.after)]
    .filter(([seatId]) => settled.has(seatId) && seatId !== change.by)
    .map(([seatId, delta]) =>
      BalanceNotice.fromPrimitives({
        id: nextId(),
        tripId: change.tripId,
        seatId,
        delta,
        cause: change.cause,
        by: change.by,
        createdAt: change.at,
        dismissedAt: null,
      }),
    );
}

export class BalanceNotice {
  private constructor(private props: BalanceNoticeProps) {}

  static fromPrimitives(props: BalanceNoticeProps): BalanceNotice {
    return new BalanceNotice({ ...props });
  }

  /** Only the person it's addressed to can mark it as seen. Idempotent. */
  dismiss(actor: SeatId, now: Date): void {
    if (actor !== this.props.seatId) throw forbidden("Este aviso es de otra persona");
    this.props.dismissedAt ??= now;
  }

  get id() {
    return this.props.id;
  }
  get seatId() {
    return this.props.seatId;
  }
  get tripId() {
    return this.props.tripId;
  }

  toPrimitives(): BalanceNoticeProps {
    return { ...this.props };
  }
}
