import type { ExpenseRepository } from "@/contexts/expense-ledger/application/ports";
import { ExpenseLedgerUseCases } from "@/contexts/expense-ledger/application/use-cases";
import { InMemoryExpenseRepository } from "@/contexts/expense-ledger/infrastructure/in-memory-expense-repository";
import { SupabaseExpenseRepository } from "@/contexts/expense-ledger/infrastructure/supabase-expense-repository";
import type { SettlementRepository } from "@/contexts/settlement/application/ports";
import { SettlementUseCases } from "@/contexts/settlement/application/use-cases";
import { InMemorySettlementRepository } from "@/contexts/settlement/infrastructure/in-memory-settlement-repository";
import { SupabaseSettlementRepository } from "@/contexts/settlement/infrastructure/supabase-settlement-repository";
import type { SeatUsage, SettlementPresence, TripRepository } from "@/contexts/trip-membership/application/ports";
import { TripMembershipUseCases } from "@/contexts/trip-membership/application/use-cases";
import { hashTokenService } from "@/contexts/trip-membership/infrastructure/hash-token-service";
import { InMemoryTripRepository } from "@/contexts/trip-membership/infrastructure/in-memory-trip-repository";
import { SupabaseTripRepository } from "@/contexts/trip-membership/infrastructure/supabase-trip-repository";
import type { Db } from "@/platform/supabase/db";
import { systemClock, type Clock } from "@/shared-kernel/clock";
import { uuidGenerator, type IdGenerator } from "@/shared-kernel/ids";
import { ledgerMembershipReader, ledgerReader, settlementMembershipReader } from "./context-adapters";

export interface Container {
  membership: TripMembershipUseCases;
  ledger: ExpenseLedgerUseCases;
  settlement: SettlementUseCases;
}

/** What each backend must provide: the three repositories plus the queries other contexts ask them. */
export interface Repositories {
  trips: TripRepository;
  expenses: ExpenseRepository & SeatUsage;
  settlements: SettlementRepository & SettlementPresence & SeatUsage;
}

/**
 * Composition root. Builds every use case with its adapters. The backend only decides which
 * repositories plug in: in-process (tests, demo without Docker) or Supabase.
 */
export function createContainer(repos: Repositories, opts: { clock?: Clock; ids?: IdGenerator } = {}): Container {
  const clock = opts.clock ?? systemClock;
  const ids = opts.ids ?? uuidGenerator;
  const { trips, expenses, settlements } = repos;

  return {
    membership: new TripMembershipUseCases({
      trips,
      tokens: hashTokenService,
      settlements,
      seatUsage: {
        isSeatUsed: async (tripId, seatId) =>
          (await expenses.isSeatUsed(tripId, seatId)) || (await settlements.isSeatUsed(tripId, seatId)),
      },
      ids,
      clock,
    }),
    ledger: new ExpenseLedgerUseCases({ expenses, membership: ledgerMembershipReader(trips), ids, clock }),
    settlement: new SettlementUseCases({
      settlements,
      ledger: ledgerReader(expenses),
      membership: settlementMembershipReader(trips),
      ids,
      clock,
    }),
  };
}

export function createMemoryContainer(opts: { clock?: Clock; ids?: IdGenerator } = {}): Container {
  return createContainer(
    {
      trips: new InMemoryTripRepository(),
      expenses: new InMemoryExpenseRepository(),
      settlements: new InMemorySettlementRepository(),
    },
    opts,
  );
}

export function createSupabaseContainer(db: Db, opts: { clock?: Clock; ids?: IdGenerator } = {}): Container {
  return createContainer(
    {
      trips: new SupabaseTripRepository(db),
      expenses: new SupabaseExpenseRepository(db),
      settlements: new SupabaseSettlementRepository(db),
    },
    opts,
  );
}
