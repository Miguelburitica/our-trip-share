/**
 * Adapters between bounded contexts. This is the only place allowed to know
 * more than one context's model: each adapter implements a port owned by the
 * consuming context by reading the upstream context.
 */
import type { ExpenseMoneyChanged, HeldChangeRepository, LedgerEventPublisher, MembershipReader, ReopenCheck } from "@/contexts/expense-ledger/application/ports";
import type { ExpenseRepository } from "@/contexts/expense-ledger/application/ports";
import type { LedgerReader, SettlementMembershipReader } from "@/contexts/settlement/application/ports";
import type { SettlementUseCases } from "@/contexts/settlement/application/use-cases";
import type { LedgerEntry } from "@/contexts/settlement/domain/ledger-entry";
import type { DigestSource, NotificationDirectory } from "@/contexts/notifications/application/ports";
import type { NotificationUseCases } from "@/contexts/notifications/application/use-cases";
import { categoryLabel, type MoneyChange } from "@/contexts/notifications/domain/messages";
import type { CloseChecks, TripRepository } from "@/contexts/trip-membership/application/ports";
import type { PrincipalId, SeatId, TripId } from "@/shared-kernel/ids";

export function ledgerMembershipReader(trips: TripRepository): MembershipReader {
  return {
    async getTripView(tripId: TripId) {
      const trip = await trips.get(tripId);
      if (!trip) return null;
      return {
        tripId: trip.id,
        status: trip.status,
        baseCurrency: trip.baseCurrency,
        seats: [
          ...trip.allSeats.map((s) => ({
            id: s.id,
            active: s.isActive,
            defaultExcluded: s.defaultExcluded,
            isAdmin: s.isAdmin,
            isPot: false,
          })),
          // La vaca can pay; it never owes a share.
          ...(trip.pot ? [{ id: trip.pot.id, active: true, defaultExcluded: true, isAdmin: false, isPot: true }] : []),
        ],
      };
    },
    async seatOf(tripId: TripId, principalId: PrincipalId) {
      const trip = await trips.get(tripId);
      return trip?.seatOf(principalId)?.id ?? null;
    },
  };
}

export function settlementMembershipReader(trips: TripRepository): SettlementMembershipReader {
  return {
    async getTripView(tripId: TripId) {
      const trip = await trips.get(tripId);
      if (!trip) return null;
      return {
        tripId: trip.id,
        status: trip.status,
        baseCurrency: trip.baseCurrency,
        settleMode: trip.settleMode,
        hubSeatId: trip.hubSeatId,
        // A seat waiting for approval isn't in the trip yet: no balance, no plan row.
        seats: [
          ...trip.allSeats.filter((s) => !s.awaitingApproval).map((s) => ({ id: s.id, isAdmin: s.isAdmin })),
          ...(trip.pot ? [{ id: trip.pot.id, isAdmin: false }] : []),
        ],
        pot: trip.pot ? { seatId: trip.pot.id, holderSeatId: trip.pot.holderSeatId! } : null,
      };
    },
    async seatOf(tripId: TripId, principalId: PrincipalId) {
      const trip = await trips.get(tripId);
      return trip?.seatOf(principalId)?.id ?? null;
    },
  };
}

/** Anti-corruption layer: translates Expense aggregates into settlement LedgerEntries. */
export function ledgerReader(expenses: ExpenseRepository): LedgerReader {
  return {
    async entries(tripId: TripId): Promise<LedgerEntry[]> {
      const all = await expenses.listByTrip(tripId);
      return all
        .filter((e) => e.countsTowardBalances)
        .map((e) => {
          const m = e.money!.props;
          return {
            expenseId: e.id,
            sign: e.sign,
            payers: m.payers.map((p) => ({ seatId: p.seatId, base: p.baseAmount! })),
            shares: m.shares.map((s) => ({ seatId: s.seatId, base: s.baseAmount! })),
          };
        });
    },
  };
}

const toLedgerChange = (e: ExpenseMoneyChanged) => {
  const entry = (effect: typeof e.before) => (effect ? { expenseId: e.expenseId, ...effect } : null);
  return {
    tripId: e.tripId,
    cause: { kind: e.kind, expenseId: e.expenseId, title: e.title, category: e.category },
    by: e.by,
    at: e.at,
    before: entry(e.before),
    after: entry(e.after),
  };
};

/** R14 while Liquidando: the ledger asks settlement whether a change would reopen a settled balance. */
export function reopenCheck(settlement: SettlementUseCases): ReopenCheck {
  return {
    async reopens(e) {
      const r = await settlement.wouldReopen(toLedgerChange(e));
      if (!r.ok) throw r.error;
      return r.value;
    },
  };
}

/**
 * Ledger money changes → settlement's R14 detection (in the request: it must be recorded) and
 * push notices (after the response). The effect shapes match LedgerEntry.
 */
export function ledgerListeners(
  settlement: SettlementUseCases,
  notifications: NotificationUseCases,
  defer: (task: () => Promise<unknown>) => void = (task) => void task(),
): LedgerEventPublisher {
  return {
    async moneyChanged(e) {
      const r = await settlement.recordLedgerChange(toLedgerChange(e));
      if (!r.ok) throw r.error;
      const change = toMoneyChange(e);
      if (change) defer(() => notifications.moneyChanged(e.tripId, change));
    },
  };
}

/** Per seat: what they owed and paid before and after. Money received (refunds) isn't pushed. */
function toMoneyChange(e: ExpenseMoneyChanged): MoneyChange | null {
  if (e.before?.sign === -1 || e.after?.sign === -1) return null;
  const sum = (rows: ReadonlyArray<{ seatId: SeatId; base: number }> | undefined, seat: SeatId) =>
    (rows ?? []).filter((r) => r.seatId === seat).reduce((a, r) => a + r.base, 0);
  const seats = [...new Set([e.before, e.after].flatMap((x) => (x ? [...x.payers, ...x.shares].map((r) => r.seatId) : [])))];
  return {
    by: e.by,
    kind: e.kind,
    what: e.title ?? categoryLabel(e.category),
    expenseId: e.expenseId,
    seats: seats.map((seatId) => ({
      seatId,
      shareBefore: sum(e.before?.shares, seatId),
      shareAfter: sum(e.after?.shares, seatId),
      paidBefore: sum(e.before?.payers, seatId),
      paidAfter: sum(e.after?.payers, seatId),
    })),
  };
}

/** Who can hear about a trip: seats already in it (not those waiting for approval), never la vaca. */
export function notificationDirectory(trips: TripRepository): NotificationDirectory {
  return {
    async trip(tripId) {
      const trip = await trips.get(tripId);
      if (!trip) return null;
      return {
        tripId: trip.id,
        tripName: trip.name,
        baseCurrency: trip.baseCurrency,
        seats: trip.allSeats
          .filter((s) => !s.awaitingApproval && s.isActive)
          .map((s) => ({ seatId: s.id, name: s.displayName, principalId: s.principalId, isAdmin: s.isAdmin })),
      };
    },
  };
}

export function digestSource(expenses: ExpenseRepository, settlement: SettlementUseCases): DigestSource {
  return {
    async activity(from, to) {
      return (await expenses.recordedBetween(from, to)).map((a) => ({ tripId: a.tripId, expenses: a.count }));
    },
    async balances(tripId) {
      const r = await settlement.seatBalances(tripId);
      if (!r.ok) throw r.error;
      return r.value;
    },
  };
}

/** Closing preconditions: drafts and R14 changes waiting for approval (ledger), pending payments (settlement). */
export function closeChecks(expenses: ExpenseRepository, settlement: SettlementUseCases, held: HeldChangeRepository): CloseChecks {
  return {
    async pending(tripId: TripId) {
      const drafts = (await expenses.listByTrip(tripId)).filter((e) => e.status === "draft").length;
      const blockers = await settlement.closeBlockers(tripId);
      if (!blockers.ok) throw blockers.error;
      const pendingApprovals = (await held.list(tripId)).length;
      return { drafts, pendingSettlements: blockers.value.pendingSettlements, pendingApprovals };
    },
  };
}
