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

/**
 * Why the seat is told: "reopened" (R14, their settled balance moved) or "paid" (someone else
 * recorded, changed or removed a payment in their name, e.g. the toll the driver paid).
 */
export type NoticeReason = "reopened" | "paid";

export interface BalanceNoticeProps {
  id: NoticeId;
  tripId: TripId;
  seatId: SeatId;
  reason: NoticeReason;
  /** For "paid": what the seat paid in this expense before and after, in base units. */
  paid: { before: number; after: number } | null;
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

/** What each seat paid in one entry (expenses only; received money isn't a payment). */
function paidIn(entry: LedgerEntry | null): Map<SeatId, number> {
  const paid = new Map<SeatId, number>();
  if (entry?.sign === 1) for (const p of entry.payers) paid.set(p.seatId, (paid.get(p.seatId) ?? 0) + p.base);
  return paid;
}

/**
 * The notices one money change produces, at most one per seat and never for whoever made it:
 * - "paid" when someone else recorded, changed or removed what the seat paid, so they can check it;
 * - otherwise "reopened" when it moves the balance of a seat that already settled (R14).
 * `skip` holds seats nobody reads notices for (la vaca).
 */
export function detectNotices(
  change: LedgerChange,
  settlements: readonly SettlementLike[],
  nextId: () => NoticeId,
  skip: ReadonlySet<SeatId> = new Set(),
): BalanceNotice[] {
  const deltas = balanceDeltas(change.before, change.after);
  const was = paidIn(change.before);
  const now = paidIn(change.after);
  const reopened = new Set(detectReopened(change, settlements, () => "check" as NoticeId).map((n) => n.seatId));
  const seats = [...new Set([...deltas.keys(), ...was.keys(), ...now.keys()])];
  return seats.flatMap((seatId) => {
    if (seatId === change.by || skip.has(seatId)) return [];
    const before = was.get(seatId) ?? 0;
    const after = now.get(seatId) ?? 0;
    const reason: NoticeReason | null = before !== after ? "paid" : reopened.has(seatId) ? "reopened" : null;
    if (!reason) return [];
    return [
      BalanceNotice.fromPrimitives({
        id: nextId(),
        tripId: change.tripId,
        seatId,
        reason,
        paid: reason === "paid" ? { before, after } : null,
        delta: deltas.get(seatId) ?? 0,
        cause: change.cause,
        by: change.by,
        createdAt: change.at,
        dismissedAt: null,
      }),
    ];
  });
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
        reason: "reopened",
        paid: null,
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
