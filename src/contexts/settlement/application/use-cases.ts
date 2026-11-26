import type { Clock } from "@/shared-kernel/clock";
import { forbidden, invalidState, notFound } from "@/shared-kernel/errors";
import { NoticeId, SettlementId, type IdGenerator, type PrincipalId, type SeatId, type TripId } from "@/shared-kernel/ids";
import { CURRENCIES } from "@/shared-kernel/money/currency";
import { isWithinDust } from "@/shared-kernel/money/money";
import { attempt, type Result } from "@/shared-kernel/result";
import { detectReopened, type ChangeCause, type LedgerChange } from "../domain/balance-notice";
import { computeBalances, ledgerBalances, overpaymentCredit } from "../domain/balances";
import type { Transfer } from "../domain/ledger-entry";
import { buildSettlingPlan, mergeSettlingPlan, planDirect, planHub, planSimplified } from "../domain/plan";
import { potSummary, settlePot } from "../domain/pot";
import { reviewShare, type ShareReviewStatus } from "../domain/share-review";
import { Settlement, type SettlementStatus } from "../domain/settlement";
import { handlesVisibleTo, normalizeHandles, type PayoutHandle } from "../domain/payout-handles";
import type {
  BalanceNoticeRepository,
  PayoutHandleRepository,
  PlanSnapshotRepository,
  ShareReviewRepository,
  LedgerReader,
  SettlementMembershipReader,
  SettlementRepository,
  SettlementTripView,
} from "./ports";

export interface SettlementDeps {
  settlements: SettlementRepository;
  notices: BalanceNoticeRepository;
  handles: PayoutHandleRepository;
  snapshots: PlanSnapshotRepository;
  reviews: ShareReviewRepository;
  ledger: LedgerReader;
  membership: SettlementMembershipReader;
  ids: IdGenerator;
  clock: Clock;
}

export interface PlannedTransfer extends Transfer {
  /** A pending settlement from → to awaiting confirmation. */
  pendingSettlementId: SettlementId | null;
  /** Liquidando: a change after freezing moved this row off the frozen plan. */
  adjusted: boolean;
}

export interface BalancesDTO {
  phase: SettlementTripView["status"];
  /** When the plan was frozen (Liquidando and Cerrado); the plan then ignores `mode`. */
  frozenAt: string | null;
  baseCurrency: string;
  settleMode: SettlementTripView["settleMode"];
  mySeatId: SeatId;
  myBalance: number;
  balances: Array<{ seatId: SeatId; balance: number; settled: boolean }>;
  plan: PlannedTransfer[];
  pending: Array<{ id: SettlementId; from: SeatId; to: SeatId; baseAmount: number }>;
  /** La vaca: how much it holds and who put what. Its seat isn't in `balances`. */
  pot: {
    seatId: SeatId;
    holderSeatId: SeatId;
    cash: number;
    contributions: Array<{ seatId: SeatId; amount: number }>;
  } | null;
}

export interface ShareReviewDTO {
  seatId: SeatId;
  status: ShareReviewStatus;
  note: string | null;
  at: string;
}

export interface NoticeDTO {
  id: NoticeId;
  delta: number;
  cause: ChangeCause;
  by: SeatId;
  at: string;
}

/** Application service for the settlement context. */
export class SettlementUseCases {
  constructor(private readonly deps: SettlementDeps) {}

  private async context(principalId: PrincipalId, tripId: TripId) {
    const trip = await this.deps.membership.getTripView(tripId);
    if (!trip) throw notFound("No encontramos ese viaje");
    const seatId = await this.deps.membership.seatOf(tripId, principalId);
    if (!seatId) throw forbidden("No eres parte de este viaje");
    const isAdmin = trip.seats.some((s) => s.id === seatId && s.isAdmin);
    const holderOf = trip.pot && trip.pot.holderSeatId === seatId ? trip.pot.seatId : null;
    return { trip, actor: { seatId, isAdmin, holderOf } };
  }

  /** Loads settlements and lazily applies auto-confirmation. */
  private async settlementsOf(tripId: TripId): Promise<Settlement[]> {
    const all = await this.deps.settlements.listByTrip(tripId);
    const now = this.deps.clock.now();
    for (const s of all) {
      if (s.autoConfirmIfDue(now)) await this.deps.settlements.save(s);
    }
    return all;
  }

  /**
   * Balances and the plan, plus who is pending. While Activo the plan follows `mode` (default: the
   * trip's); from Liquidando on it is the frozen plan with its deltas (R9), whatever `mode` says.
   */
  private async compute(tripId: TripId, trip: SettlementTripView, mode?: SettlementTripView["settleMode"]) {
    const entries = await this.deps.ledger.entries(tripId);
    const all = await this.settlementsOf(tripId);
    const settlements = all.map((s) => s.toPrimitives());
    const seatIds = trip.seats.map((s) => s.id);
    const { balances } = computeBalances(seatIds, entries, settlements);
    const dust = CURRENCIES[trip.baseCurrency].dustTolerance - 1;
    const pending = settlements.filter((s) => s.status === "pending");
    // La vaca's leftover goes back to contributors first (from its holder); then people settle up.
    // Directo keeps the pot as one more party: each person squares with it for what they used.
    const pot = trip.pot ?? null;
    const potted = pot ? settlePot(pot, balances, settlements) : { balances, refunds: [] };
    const livePlan = (m: SettlementTripView["settleMode"]) =>
      m === "direct"
        ? planDirect(entries, settlements)
        : [
            ...potted.refunds,
            ...(m === "hub" && trip.hubSeatId ? planHub(potted.balances, trip.hubSeatId, dust) : planSimplified(potted.balances, dust)),
          ];
    const potInfo = pot ? { ...pot, ...potSummary(pot, balances, settlements) } : null;

    if (trip.status === "active") {
      const effectiveMode = mode ?? trip.settleMode;
      const transfers = livePlan(effectiveMode).map((t) => ({ ...t, adjusted: false }));
      return { seatIds, balances, transfers, effectiveMode, pending, frozenAt: null, potInfo };
    }
    // A trip that reached Liquidando without a stored plan (the freeze right after "Empezar a
    // liquidar" failed) freezes now.
    const snapshot =
      (await this.deps.snapshots.get(tripId)) ??
      (await this.deps.snapshots.saveIfAbsent(tripId, {
        frozenAt: this.deps.clock.now(),
        transfers: livePlan(trip.settleMode),
        ledgerBalances: ledgerBalances(seatIds, entries),
      }));
    const confirmedSinceFreeze = settlements.filter(
      (s) => s.status === "confirmed" && s.resolvedAt !== null && s.resolvedAt > snapshot.frozenAt,
    );
    // La vaca's refunds follow what it holds now (they aren't frozen); people's rows stay frozen.
    const onPot = (t: { from: SeatId; to: SeatId }) => pot !== null && (t.from === pot.seatId || t.to === pot.seatId);
    const transfers = [
      ...potted.refunds.map((t) => ({ ...t, adjusted: false })),
      ...mergeSettlingPlan(
        buildSettlingPlan({ frozen: snapshot.transfers.filter((t) => !onPot(t)), balances: potted.balances, confirmedSinceFreeze, dust }),
      ),
    ];
    return { seatIds, balances, transfers, effectiveMode: trip.settleMode, pending, frozenAt: snapshot.frozenAt, potInfo };
  }

  /**
   * Freezes the plan as it stands (R9). Called right after the trip enters Liquidando; a plan
   * already frozen (a second call, a reopened trip) is kept.
   */
  freezePlan(principalId: PrincipalId, tripId: TripId): Promise<Result<void>> {
    return attempt(async () => {
      const { trip, actor } = await this.context(principalId, tripId);
      if (!actor.isAdmin) throw forbidden("Solo el organizador o un admin puede empezar a liquidar");
      if (trip.status === "active") throw invalidState("El viaje aún no está liquidando");
      await this.compute(tripId, trip);
    });
  }

  /** What still blocks closing, for trip-membership's close (it checks who may close). */
  closeBlockers(tripId: TripId): Promise<Result<{ pendingSettlements: number }>> {
    return attempt(async () => {
      const all = await this.settlementsOf(tripId);
      return { pendingSettlements: all.filter((s) => s.status === "pending").length };
    });
  }

  /** "Revisa tu parte": "Todo bien" or a question, while the trip is Liquidando. */
  reviewMyShare(
    principalId: PrincipalId,
    tripId: TripId,
    input: { status: string; note?: string | null },
  ): Promise<Result<ShareReviewDTO>> {
    return attempt(async () => {
      const { trip, actor } = await this.context(principalId, tripId);
      if (trip.status !== "settling") throw invalidState("Solo se revisa la parte mientras el viaje está liquidando");
      const review = reviewShare({ tripId, seatId: actor.seatId, ...input }, this.deps.clock.now());
      await this.deps.reviews.set(review);
      return { seatId: review.seatId, status: review.status, note: review.note, at: review.updatedAt.toISOString() };
    });
  }

  getMyShareReview(principalId: PrincipalId, tripId: TripId): Promise<Result<ShareReviewDTO | null>> {
    return attempt(async () => {
      const { actor } = await this.context(principalId, tripId);
      const r = await this.deps.reviews.get(tripId, actor.seatId);
      return r ? { seatId: r.seatId, status: r.status, note: r.note, at: r.updatedAt.toISOString() } : null;
    });
  }

  /**
   * Everyone's answers for the trip's admins (questions included); a member gets only how many
   * people already said "Todo bien", never what anyone asked.
   */
  listShareReviews(principalId: PrincipalId, tripId: TripId): Promise<Result<{ ok: number; questions: ShareReviewDTO[] }>> {
    return attempt(async () => {
      const { actor } = await this.context(principalId, tripId);
      const all = await this.deps.reviews.list(tripId);
      const ok = all.filter((r) => r.status === "ok").length;
      const questions = actor.isAdmin
        ? all
            .filter((r) => r.status === "question")
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
            .map((r) => ({ seatId: r.seatId, status: r.status, note: r.note, at: r.updatedAt.toISOString() }))
        : [];
      return { ok, questions };
    });
  }

  getTripBalances(principalId: PrincipalId, tripId: TripId, mode?: SettlementTripView["settleMode"]): Promise<Result<BalancesDTO>> {
    return attempt(async () => {
      const { trip, actor } = await this.context(principalId, tripId);
      const { seatIds, balances, transfers, effectiveMode, pending, frozenAt, potInfo } = await this.compute(tripId, trip, mode);
      return {
        phase: trip.status,
        frozenAt: frozenAt?.toISOString() ?? null,
        baseCurrency: trip.baseCurrency,
        settleMode: effectiveMode,
        mySeatId: actor.seatId,
        myBalance: balances.get(actor.seatId) ?? 0,
        pot: potInfo ? { ...potInfo, contributions: [...potInfo.contributions] } : null,
        balances: seatIds.filter((id) => id !== potInfo?.seatId).map((seatId) => {
          const balance = balances.get(seatId) ?? 0;
          return { seatId, balance, settled: isWithinDust(balance, trip.baseCurrency) };
        }),
        plan: transfers.map((t) => ({
          ...t,
          pendingSettlementId: pending.find((p) => p.from === t.from && p.to === t.to)?.id ?? null,
        })),
        pending: pending.map((p) => ({ id: p.id, from: p.from, to: p.to, baseAmount: p.baseAmount })),
      };
    });
  }

  /** "Cómo me pagan": my own payment details in this trip. */
  getMyHandles(principalId: PrincipalId, tripId: TripId): Promise<Result<PayoutHandle[]>> {
    return attempt(async () => {
      const { actor } = await this.context(principalId, tripId);
      return this.deps.handles.get(tripId, actor.seatId);
    });
  }

  setMyHandles(principalId: PrincipalId, tripId: TripId, input: ReadonlyArray<{ kind: string; value: string }>): Promise<Result<PayoutHandle[]>> {
    return attempt(async () => {
      const { actor } = await this.context(principalId, tripId);
      const handles = normalizeHandles(input);
      await this.deps.handles.set(tripId, actor.seatId, handles);
      return handles;
    });
  }

  /**
   * The payment details of the people I owe right now (in `mode`, as Cuentas shows it). Nobody
   * else's are returned.
   */
  getHandlesToPay(
    principalId: PrincipalId,
    tripId: TripId,
    mode?: SettlementTripView["settleMode"],
  ): Promise<Result<Array<{ seatId: SeatId; handles: PayoutHandle[] }>>> {
    return attempt(async () => {
      const { trip, actor } = await this.context(principalId, tripId);
      const { transfers } = await this.compute(tripId, trip, mode);
      // What I owe la vaca goes to whoever keeps it, so I see their details.
      const pot = trip.pot ?? null;
      const owedTo = (id: SeatId) => (pot && id === pot.seatId ? pot.holderSeatId : id);
      const visible = [...handlesVisibleTo(actor.seatId, transfers)];
      const found = await this.deps.handles.getMany(tripId, visible.map(owedTo));
      return visible.map((seatId) => ({ seatId, handles: found.get(owedTo(seatId)) ?? [] }));
    });
  }

  recordSettlement(
    principalId: PrincipalId,
    tripId: TripId,
    input: { from: SeatId; to: SeatId; amount: number; currency?: string; baseAmount?: number; method: string; note?: string },
  ): Promise<Result<{ id: SettlementId; status: SettlementStatus; overpaymentCredit: number }>> {
    return attempt(async () => {
      const { trip, actor } = await this.context(principalId, tripId);
      if (trip.status === "closed") throw invalidState("El viaje está cerrado");
      const currency = input.currency ?? trip.baseCurrency;
      const baseAmount = input.baseAmount ?? input.amount;
      const entries = await this.deps.ledger.entries(tripId);
      const existing = (await this.settlementsOf(tripId)).map((s) => s.toPrimitives());
      const { balances } = computeBalances(trip.seats.map((s) => s.id), entries, existing);
      const settlement = Settlement.record(
        { id: SettlementId(this.deps.ids.next()), tripId, ...input, currency, baseAmount },
        actor,
        this.deps.clock.now(),
      );
      await this.deps.settlements.save(settlement);
      return {
        id: settlement.id,
        status: settlement.status,
        overpaymentCredit: overpaymentCredit(balances.get(input.from) ?? 0, baseAmount),
      };
    });
  }

  confirmSettlement(principalId: PrincipalId, tripId: TripId, id: SettlementId): Promise<Result<void>> {
    return this.transition(principalId, tripId, id, (s, actor, now) => s.confirm(actor, now));
  }

  disputeSettlement(principalId: PrincipalId, tripId: TripId, id: SettlementId): Promise<Result<void>> {
    return this.transition(principalId, tripId, id, (s, actor, now) => s.dispute(actor, now));
  }

  private transition(
    principalId: PrincipalId,
    tripId: TripId,
    id: SettlementId,
    apply: (s: Settlement, actor: { seatId: SeatId; isAdmin: boolean }, now: Date) => void,
  ): Promise<Result<void>> {
    return attempt(async () => {
      const { actor } = await this.context(principalId, tripId);
      const settlement = await this.deps.settlements.get(id);
      if (!settlement || settlement.toPrimitives().tripId !== tripId) throw notFound("No encontramos ese pago");
      apply(settlement, actor, this.deps.clock.now());
      await this.deps.settlements.save(settlement);
    });
  }

  /**
   * Called after the ledger saved a money change (the ledger already checked permissions). Records a
   * "Tu saldo cambió" notice for each settled seat the change moved. Returns how many were created.
   */
  recordLedgerChange(change: LedgerChange): Promise<Result<number>> {
    return attempt(async () => {
      const settlements = (await this.deps.settlements.listByTrip(change.tripId)).map((s) => s.toPrimitives());
      const notices = detectReopened(change, settlements, () => NoticeId(this.deps.ids.next()));
      if (notices.length) await this.deps.notices.add(notices);
      return notices.length;
    });
  }

  listMyNotices(principalId: PrincipalId, tripId: TripId): Promise<Result<NoticeDTO[]>> {
    return attempt(async () => {
      const { actor } = await this.context(principalId, tripId);
      const open = await this.deps.notices.listOpen(tripId, actor.seatId);
      return open.map((n) => {
        const p = n.toPrimitives();
        return { id: p.id, delta: p.delta, cause: p.cause, by: p.by, at: p.createdAt.toISOString() };
      });
    });
  }

  dismissNotice(principalId: PrincipalId, tripId: TripId, id: NoticeId): Promise<Result<void>> {
    return attempt(async () => {
      const { actor } = await this.context(principalId, tripId);
      const notice = await this.deps.notices.get(id);
      if (!notice || notice.tripId !== tripId) throw notFound("No encontramos ese aviso");
      notice.dismiss(actor.seatId, this.deps.clock.now());
      await this.deps.notices.save(notice);
    });
  }
}
