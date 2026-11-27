import type {
  ExpenseRepository,
  FxRateProvider,
  HeldChangeRepository,
  ReceiptReader,
  ReceiptCompressor,
  ReceiptStore,
  SplitGroupRepository,
} from "@/contexts/expense-ledger/application/ports";
import { InMemoryHeldChangeRepository } from "@/contexts/expense-ledger/infrastructure/in-memory-held-change-repository";
import { SupabaseHeldChangeRepository } from "@/contexts/expense-ledger/infrastructure/supabase-held-change-repository";
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
  SummaryLinkRepository,
} from "@/contexts/settlement/application/ports";
import { SettlementUseCases } from "@/contexts/settlement/application/use-cases";
import { InMemoryBalanceNoticeRepository } from "@/contexts/settlement/infrastructure/in-memory-balance-notice-repository";
import { InMemoryPayoutHandleRepository } from "@/contexts/settlement/infrastructure/in-memory-payout-handle-repository";
import { InMemoryPlanSnapshotRepository } from "@/contexts/settlement/infrastructure/in-memory-plan-snapshot-repository";
import { InMemoryShareReviewRepository } from "@/contexts/settlement/infrastructure/in-memory-share-review-repository";
import { InMemorySummaryLinkRepository } from "@/contexts/settlement/infrastructure/in-memory-summary-link-repository";
import { InMemorySettlementRepository } from "@/contexts/settlement/infrastructure/in-memory-settlement-repository";
import { SupabasePayoutHandleRepository } from "@/contexts/settlement/infrastructure/supabase-payout-handle-repository";
import { SupabasePlanSnapshotRepository } from "@/contexts/settlement/infrastructure/supabase-plan-snapshot-repository";
import { SupabaseShareReviewRepository } from "@/contexts/settlement/infrastructure/supabase-share-review-repository";
import { SupabaseSummaryLinkRepository } from "@/contexts/settlement/infrastructure/supabase-summary-link-repository";
import { SupabaseBalanceNoticeRepository } from "@/contexts/settlement/infrastructure/supabase-balance-notice-repository";
import { SupabaseSettlementRepository } from "@/contexts/settlement/infrastructure/supabase-settlement-repository";
import type { SeatUsage, SettlementPresence, TripRepository } from "@/contexts/trip-membership/application/ports";
import { TripMembershipUseCases } from "@/contexts/trip-membership/application/use-cases";
import { hashTokenService } from "@/contexts/trip-membership/infrastructure/hash-token-service";
import { InMemoryTripRepository } from "@/contexts/trip-membership/infrastructure/in-memory-trip-repository";
import { SupabaseTripRepository } from "@/contexts/trip-membership/infrastructure/supabase-trip-repository";
import type { PushSender, PushSubscriptionRepository } from "@/contexts/notifications/application/ports";
import { NotificationUseCases } from "@/contexts/notifications/application/use-cases";
import { InMemoryPushSubscriptionRepository } from "@/contexts/notifications/infrastructure/in-memory-push-subscriptions";
import { SupabasePushSubscriptionRepository } from "@/contexts/notifications/infrastructure/supabase-push-subscriptions";
import type { Db } from "@/platform/supabase/db";
import { systemClock, type Clock } from "@/shared-kernel/clock";
import { uuidGenerator, type IdGenerator } from "@/shared-kernel/ids";
import {
  closeChecks,
  digestSource,
  ledgerListeners,
  ledgerMembershipReader,
  ledgerReader,
  notificationDirectory,
  reopenCheck,
  settlementMembershipReader,
} from "./context-adapters";

export interface Container {
  membership: TripMembershipUseCases;
  ledger: ExpenseLedgerUseCases;
  settlement: SettlementUseCases;
  notifications: NotificationUseCases;
}

/** What each backend must provide: the repositories plus the queries other contexts ask them. */
export interface Repositories {
  trips: TripRepository;
  expenses: ExpenseRepository & SeatUsage;
  splitGroups: SplitGroupRepository;
  receipts: ReceiptStore;
  held: HeldChangeRepository;
  settlements: SettlementRepository & SettlementPresence & SeatUsage;
  notices: BalanceNoticeRepository;
  handles: PayoutHandleRepository;
  snapshots: PlanSnapshotRepository;
  reviews: ShareReviewRepository;
  links: SummaryLinkRepository;
  pushSubscriptions: PushSubscriptionRepository;
}

export interface ContainerOptions {
  clock?: Clock;
  ids?: IdGenerator;
  /** Reads receipt photos; null/absent attaches photos without reading them. */
  reader?: ReceiptReader | null;
  /** Shrinks the stored copy of receipt photos; null/absent stores them as uploaded. */
  compressor?: ReceiptCompressor | null;
  /** Daily FX rates; null/absent leaves foreign-currency expenses "tasa pendiente". */
  rates?: FxRateProvider | null;
  /** Web Push; null/absent sends nothing (no VAPID keys configured). */
  push?: PushSender | null;
  /**
   * Runs side work after the response (Next's `after`). Absent: runs it right away and waits,
   * which is what tests want.
   */
  defer?: (task: () => Promise<unknown>) => void;
}

/**
 * Composition root. Builds every use case with its adapters. The backend only decides which
 * repositories plug in: in-process (tests, demo without Docker) or Supabase.
 */
export function createContainer(repos: Repositories, opts: ContainerOptions = {}): Container {
  const clock = opts.clock ?? systemClock;
  const ids = opts.ids ?? uuidGenerator;
  const { trips, expenses, splitGroups, receipts, held, settlements, notices, handles, snapshots, reviews, links, pushSubscriptions } = repos;
  const settlement = new SettlementUseCases({
    settlements,
    notices,
    handles,
    snapshots,
    reviews,
    links,
    ledger: ledgerReader(expenses),
    membership: settlementMembershipReader(trips),
    ids,
    clock,
  });

  const notifications = new NotificationUseCases({
    subscriptions: pushSubscriptions,
    directory: notificationDirectory(trips),
    sender: opts.push ?? null,
    digest: digestSource(expenses, settlement),
    clock,
  });

  return {
    membership: new TripMembershipUseCases({
      trips,
      tokens: hashTokenService,
      settlements,
      closeChecks: closeChecks(expenses, settlement, held),
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
      compressor: opts.compressor ?? null,
      rates: opts.rates ?? null,
      held,
      reopenCheck: reopenCheck(settlement),
      membership: ledgerMembershipReader(trips),
      events: ledgerListeners(settlement, notifications, opts.defer),
      ids,
      clock,
    }),
    settlement,
    notifications,
  };
}

export function createMemoryContainer(opts: ContainerOptions = {}): Container {
  return createContainer(
    {
      trips: new InMemoryTripRepository(),
      expenses: new InMemoryExpenseRepository(),
      splitGroups: new InMemorySplitGroupRepository(),
      receipts: new InMemoryReceiptStore(),
      held: new InMemoryHeldChangeRepository(),
      settlements: new InMemorySettlementRepository(),
      notices: new InMemoryBalanceNoticeRepository(),
      handles: new InMemoryPayoutHandleRepository(),
      snapshots: new InMemoryPlanSnapshotRepository(),
      reviews: new InMemoryShareReviewRepository(),
      links: new InMemorySummaryLinkRepository(),
      pushSubscriptions: new InMemoryPushSubscriptionRepository(),
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
      held: new SupabaseHeldChangeRepository(db),
      settlements: new SupabaseSettlementRepository(db),
      notices: new SupabaseBalanceNoticeRepository(db),
      handles: new SupabasePayoutHandleRepository(db),
      snapshots: new SupabasePlanSnapshotRepository(db),
      reviews: new SupabaseShareReviewRepository(db),
      links: new SupabaseSummaryLinkRepository(db),
      pushSubscriptions: new SupabasePushSubscriptionRepository(db),
    },
    opts,
  );
}
