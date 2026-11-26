import type { Clock } from "@/shared-kernel/clock";
import { forbidden, notFound } from "@/shared-kernel/errors";
import { SettlementId, type IdGenerator, type PrincipalId, type SeatId, type TripId } from "@/shared-kernel/ids";
import { CURRENCIES } from "@/shared-kernel/money/currency";
import { isWithinDust } from "@/shared-kernel/money/money";
import { attempt, type Result } from "@/shared-kernel/result";
import { computeBalances, overpaymentCredit } from "../domain/balances";
import type { Transfer } from "../domain/ledger-entry";
import { planDirect, planHub, planSimplified } from "../domain/plan";
import { Settlement, type SettlementStatus } from "../domain/settlement";
import type { LedgerReader, SettlementMembershipReader, SettlementRepository, SettlementTripView } from "./ports";

export interface SettlementDeps {
  settlements: SettlementRepository;
  ledger: LedgerReader;
  membership: SettlementMembershipReader;
  ids: IdGenerator;
  clock: Clock;
}

export interface PlannedTransfer extends Transfer {
  /** A pending settlement from → to awaiting confirmation. */
  pendingSettlementId: SettlementId | null;
}

export interface BalancesDTO {
  baseCurrency: string;
  settleMode: SettlementTripView["settleMode"];
  mySeatId: SeatId;
  myBalance: number;
  balances: Array<{ seatId: SeatId; balance: number; settled: boolean }>;
  plan: PlannedTransfer[];
  pending: Array<{ id: SettlementId; from: SeatId; to: SeatId; baseAmount: number }>;
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
    return { trip, actor: { seatId, isAdmin } };
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

  getTripBalances(principalId: PrincipalId, tripId: TripId, mode?: SettlementTripView["settleMode"]): Promise<Result<BalancesDTO>> {
    return attempt(async () => {
      const { trip, actor } = await this.context(principalId, tripId);
      const entries = await this.deps.ledger.entries(tripId);
      const settlements = (await this.settlementsOf(tripId)).map((s) => s.toPrimitives());
      const seatIds = trip.seats.map((s) => s.id);
      const { balances } = computeBalances(seatIds, entries, settlements);
      const dust = CURRENCIES[trip.baseCurrency].dustTolerance - 1;
      const effectiveMode = mode ?? trip.settleMode;
      const transfers =
        effectiveMode === "hub" && trip.hubSeatId
          ? planHub(balances, trip.hubSeatId, dust)
          : effectiveMode === "direct"
            ? planDirect(entries, settlements)
            : planSimplified(balances, dust);
      const pending = settlements.filter((s) => s.status === "pending");
      return {
        baseCurrency: trip.baseCurrency,
        settleMode: effectiveMode,
        mySeatId: actor.seatId,
        myBalance: balances.get(actor.seatId) ?? 0,
        balances: seatIds.map((seatId) => {
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

  recordSettlement(
    principalId: PrincipalId,
    tripId: TripId,
    input: { from: SeatId; to: SeatId; amount: number; currency?: string; baseAmount?: number; method: string; note?: string },
  ): Promise<Result<{ id: SettlementId; status: SettlementStatus; overpaymentCredit: number }>> {
    return attempt(async () => {
      const { trip, actor } = await this.context(principalId, tripId);
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
}
