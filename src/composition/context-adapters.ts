/**
 * Adapters between bounded contexts. This is the only place allowed to know
 * more than one context's model: each adapter implements a port owned by the
 * consuming context by reading the upstream context.
 */
import type { LedgerEventPublisher, MembershipReader } from "@/contexts/expense-ledger/application/ports";
import type { ExpenseRepository } from "@/contexts/expense-ledger/application/ports";
import type { LedgerReader, SettlementMembershipReader } from "@/contexts/settlement/application/ports";
import type { SettlementUseCases } from "@/contexts/settlement/application/use-cases";
import type { LedgerEntry } from "@/contexts/settlement/domain/ledger-entry";
import type { TripRepository } from "@/contexts/trip-membership/application/ports";
import type { PrincipalId, TripId } from "@/shared-kernel/ids";

export function ledgerMembershipReader(trips: TripRepository): MembershipReader {
  return {
    async getTripView(tripId: TripId) {
      const trip = await trips.get(tripId);
      if (!trip) return null;
      return {
        tripId: trip.id,
        status: trip.status,
        baseCurrency: trip.baseCurrency,
        seats: trip.allSeats.map((s) => ({
          id: s.id,
          active: s.isActive,
          defaultExcluded: s.defaultExcluded,
          isAdmin: s.isAdmin,
        })),
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
        seats: trip.allSeats.filter((s) => !s.awaitingApproval).map((s) => ({ id: s.id, isAdmin: s.isAdmin })),
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

/** Ledger money changes → settlement's R14 detection. The effect shapes match LedgerEntry. */
export function settlementListener(settlement: SettlementUseCases): LedgerEventPublisher {
  return {
    async moneyChanged(e) {
      const entry = (effect: typeof e.before) => (effect ? { expenseId: e.expenseId, ...effect } : null);
      const r = await settlement.recordLedgerChange({
        tripId: e.tripId,
        cause: { kind: e.kind, expenseId: e.expenseId, title: e.title, category: e.category },
        by: e.by,
        at: e.at,
        before: entry(e.before),
        after: entry(e.after),
      });
      if (!r.ok) throw r.error;
    },
  };
}
