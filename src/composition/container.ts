import type { ExpenseRepository, FxRateProvider, ReceiptReader, ReceiptStore, SplitGroupRepository } from "@/contexts/expense-ledger/application/ports";
import { ExpenseLedgerUseCases } from "@/contexts/expense-ledger/application/use-cases";
import { InMemoryExpenseRepository } from "@/contexts/expense-ledger/infrastructure/in-memory-expense-repository";
import { InMemoryReceiptStore } from "@/contexts/expense-ledger/infrastructure/in-memory-receipt-store";
import { InMemorySplitGroupRepository } from "@/contexts/expense-ledger/infrastructure/in-memory-split-group-repository";
import { SupabaseReceiptStore } from "@/contexts/expense-ledger/infrastructure/supabase-receipt-store";
import { SupabaseExpenseRepository } from "@/contexts/expense-ledger/infrastructure/supabase-expense-repository";
import { SupabaseSplitGroupRepository } from "@/contexts/expense-ledger/infrastructure/supabase-split-group-repository";
import type {
  BalanceNoticeRepository,
  PayoutHandleRepository,
  PlanSnapshotRepository,
  SettlementRepository,
  ShareReviewRepository,
} from "@/contexts/settlement/application/ports";
import { SettlementUseCases } from "@/contexts/settlement/application/use-cases";
import { InMemoryBalanceNoticeRepository } from "@/contexts/settlement/infrastructure/in-memory-balance-notice-repository";
import { InMemoryPayoutHandleRepository } from "@/contexts/settlement/infrastructure/in-memory-payout-handle-repository";
import { InMemoryPlanSnapshotRepository } from "@/contexts/settlement/infrastructure/in-memory-plan-snapshot-repository";
import { InMemoryShareReviewRepository } from "@/contexts/settlement/infrastructure/in-memory-share-review-repository";
import { InMemorySettlementRepository } from "@/contexts/settlement/infrastructure/in-memory-settlement-repository";
import { SupabasePayoutHandleRepository } from "@/contexts/settlement/infrastructure/supabase-payout-handle-repository";
import { SupabasePlanSnapshotRepository } from "@/contexts/settlement/infrastructure/supabase-plan-snapshot-repository";
import { SupabaseShareReviewRepository } from "@/contexts/settlement/infrastructure/supabase-share-review-repository";
import { SupabaseBalanceNoticeRepository } from "@/contexts/settlement/infrastructure/supabase-balance-notice-repository";
import { SupabaseSettlementRepository } from "@/contexts/settlement/infrastructure/supabase-settlement-repository";
import type { SeatUsage, SettlementPresence, TripRepository } from "@/contexts/trip-membership/application/ports";
import { TripMembershipUseCases } from "@/contexts/trip-membership/application/use-cases";
import { hashTokenService } from "@/contexts/trip-membership/infrastructure/hash-token-service";
import { InMemoryTripRepository } from "@/contexts/trip-membership/infrastructure/in-memory-trip-repository";
import { SupabaseTripRepository } from "@/contexts/trip-membership/infrastructure/supabase-trip-repository";
import type { Db } from "@/platform/supabase/db";
import { systemClock, type Clock } from "@/shared-kernel/clock";
import { uuidGenerator, type IdGenerator } from "@/shared-kernel/ids";
import { closeChecks, ledgerMembershipReader, ledgerReader, settlementListener, settlementMembershipReader } from "./context-adapters";

export interface Container {
  membership: TripMembershipUseCases;
  ledger: ExpenseLedgerUseCases;
  settlement: SettlementUseCases;
}

/** What each backend must provide: the repositories plus the queries other contexts ask them. */
export interface Repositories {
  trips: TripRepository;
  expenses: ExpenseRepository & SeatUsage;
  splitGroups: SplitGroupRepository;
  receipts: ReceiptStore;
  settlements: SettlementRepository & SettlementPresence & SeatUsage;
  notices: BalanceNoticeRepository;
  handles: PayoutHandleRepository;
  snapshots: PlanSnapshotRepository;
  reviews: ShareReviewRepository;
}

export interface ContainerOptions {
  clock?: Clock;
  ids?: IdGenerator;
  /** Reads receipt photos; null/absent attaches photos without reading them. */
  reader?: ReceiptReader | null;
  /** Daily FX rates; null/absent leaves foreign-currency expenses "tasa pendiente". */
  rates?: FxRateProvider | null;
}

/**
 * Composition root. Builds every use case with its adapters. The backend only decides which
 * repositories plug in: in-process (tests, demo without Docker) or Supabase.
 */
export function createContainer(repos: Repositories, opts: ContainerOptions = {}): Container {
  const clock = opts.clock ?? systemClock;
  const ids = opts.ids ?? uuidGenerator;
  const { trips, expenses, splitGroups, receipts, settlements, notices, handles, snapshots, reviews } = repos;
  const settlement = new SettlementUseCases({
    settlements,
    notices,
    handles,
    snapshots,
    reviews,
    ledger: ledgerReader(expenses),
    membership: settlementMembershipReader(trips),
    ids,
    clock,
  });

  return {
    membership: new TripMembershipUseCases({
      trips,
      tokens: hashTokenService,
      settlements,
      closeChecks: closeChecks(expenses, settlement),
      seatUsage: {
        isSeatUsed: async (tripId, seatId) =>
          (await expenses.isSeatUsed(tripId, seatId)) || (await settlements.isSeatUsed(tripId, seatId)),
      },
      ids,
      clock,
    }),
    ledger: new ExpenseLedgerUseCases({
      expenses,
      splitGroups,
      receipts,
      reader: opts.reader ?? null,
      rates: opts.rates ?? null,
      membership: ledgerMembershipReader(trips),
      events: settlementListener(settlement),
      ids,
      clock,
    }),
    settlement,
  };
}

export function createMemoryContainer(opts: ContainerOptions = {}): Container {
  return createContainer(
    {
      trips: new InMemoryTripRepository(),
      expenses: new InMemoryExpenseRepository(),
      splitGroups: new InMemorySplitGroupRepository(),
      receipts: new InMemoryReceiptStore(),
      settlements: new InMemorySettlementRepository(),
      notices: new InMemoryBalanceNoticeRepository(),
      handles: new InMemoryPayoutHandleRepository(),
      snapshots: new InMemoryPlanSnapshotRepository(),
      reviews: new InMemoryShareReviewRepository(),
    },
    opts,
  );
}

export function createSupabaseContainer(db: Db, opts: ContainerOptions = {}): Container {
  return createContainer(
    {
      trips: new SupabaseTripRepository(db),
      expenses: new SupabaseExpenseRepository(db),
      splitGroups: new SupabaseSplitGroupRepository(db),
      receipts: new SupabaseReceiptStore(db),
      settlements: new SupabaseSettlementRepository(db),
      notices: new SupabaseBalanceNoticeRepository(db),
      handles: new SupabasePayoutHandleRepository(db),
      snapshots: new SupabasePlanSnapshotRepository(db),
      reviews: new SupabaseShareReviewRepository(db),
    },
    opts,
  );
}
