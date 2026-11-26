import type { Clock } from "@/shared-kernel/clock";
import { forbidden, invalidState, notFound, validationError } from "@/shared-kernel/errors";
import { isCurrencyCode } from "@/shared-kernel/money/currency";
import { ExpenseId, SplitGroupId, type IdGenerator, type PrincipalId, type SeatId, type TripId } from "@/shared-kernel/ids";
import { attempt, type Result } from "@/shared-kernel/result";
import { Expense, type Category, type Context, type ExpenseEffect, type ExpenseType, type MoneyInput } from "../domain/expense";
import type { FxInput } from "../domain/money-block";
import { evaluateGuards, type ExpenseWarning } from "../domain/guards";
import { SplitGroup } from "../domain/split-group";
import { suggestSplit } from "../domain/split-suggestion";
import {
  assertReceiptImage,
  assertReceiptPaths,
  prefillFromReading,
  type ReceiptImage,
  type ReceiptPrefill,
} from "../domain/receipt";
import type {
  ExpenseMoneyChanged,
  ExpenseRepository,
  FxRateProvider,
  LedgerEventPublisher,
  MembershipReader,
  ReceiptReader,
  ReceiptStore,
  SplitGroupRepository,
} from "./ports";

export interface ExpenseLedgerDeps {
  expenses: ExpenseRepository;
  splitGroups: SplitGroupRepository;
  membership: MembershipReader;
  receipts: ReceiptStore;
  /** Optional: reads receipt photos; without it photos are attached but not read. */
  reader?: ReceiptReader | null;
  /** Optional: who hears about saved money changes. */
  events?: LedgerEventPublisher;
  /** Optional: daily FX rates; without it foreign-currency expenses wait for a rate ("tasa pendiente"). */
  rates?: FxRateProvider | null;
  ids: IdGenerator;
  clock: Clock;
}

export interface ExpenseDTO {
  id: ExpenseId;
  type: ExpenseType;
  status: "draft" | "complete" | "deleted";
  category: Category;
  title: string | null;
  occurredAt: string;
  currency: string | null;
  amount: number | null;
  baseAmount: number | null;
  ratePending: boolean;
  /** "1 <currency> = fxRate <base>", frozen; null in the base currency or while pending. */
  fxRate: string | null;
  fxSource: "same_currency" | "api" | "manual" | "card_charge" | null;
  payers: Array<{ seatId: SeatId; amount: number }>;
  shares: Array<{ seatId: SeatId; amount: number; baseAmount: number | null }>;
  /** My share in base units; null if I'm not in it or while the rate is pending. */
  myShare: number | null;
  /** Whether I'm among the people it's split between. */
  includesMe: boolean;
  moneyVersion: number;
  createdBy: SeatId;
  receiptCount: number;
}

export function toExpenseDTO(expense: Expense, mySeatId: SeatId | null): ExpenseDTO {
  const money = expense.money;
  const mine = mySeatId && money ? money.shareOf(mySeatId) : undefined;
  return {
    id: expense.id,
    type: expense.type,
    status: expense.status,
    category: expense.category,
    title: expense.title,
    occurredAt: expense.occurredAt.toISOString(),
    currency: money?.props.currency ?? null,
    amount: money?.props.amount ?? null,
    baseAmount: money?.props.baseAmount ?? null,
    ratePending: money?.ratePending ?? false,
    fxRate: money && money.props.currency !== money.props.baseCurrency ? money.props.fxRate : null,
    fxSource: money?.props.fxSource ?? null,
    payers: money?.props.payers.map((p) => ({ seatId: p.seatId, amount: p.amount })) ?? [],
    shares: money?.props.shares.map((s) => ({ seatId: s.seatId, amount: s.amount, baseAmount: s.baseAmount })) ?? [],
    myShare: mine ? mine.baseAmount : null,
    includesMe: mine !== undefined,
    moneyVersion: expense.moneyVersion,
    createdBy: expense.createdBy,
    receiptCount: expense.toPrimitives().receiptPaths.length,
  };
}

export interface SplitGroupDTO {
  id: SplitGroupId;
  name: string;
  seatIds: SeatId[];
  canDelete: boolean;
}

export interface QuickAddDefaultsDTO {
  participants: SeatId[];
  sameAsLast: SeatId[] | null;
  preselected: boolean;
  groups: SplitGroupDTO[];
}

export interface ExpenseDetailDTO extends ExpenseDTO {
  splitMethod: "equal" | "exact" | null;
  notes: string | null;
  history: Array<{ at: string; by: SeatId; kind: string; moneyVersion: number }>;
}

/** Application service for the expense-ledger context. */
export class ExpenseLedgerUseCases {
  constructor(private readonly deps: ExpenseLedgerDeps) {}

  private async context(principalId: PrincipalId, tripId: TripId): Promise<Context> {
    const trip = await this.deps.membership.getTripView(tripId);
    if (!trip) throw notFound("No encontramos ese viaje");
    const actor = await this.deps.membership.seatOf(tripId, principalId);
    if (!actor) throw forbidden("No eres parte de este viaje");
    return { actor, trip, now: this.deps.clock.now() };
  }

  /**
   * Best effort after the save: the expense is already stored, so a failing listener must not turn
   * a successful action into an error the user would retry (and duplicate).
   */
  private async publish(kind: ExpenseMoneyChanged["kind"], expense: Expense, ctx: Context, before: ExpenseEffect | null) {
    const after = expense.effect;
    if (!this.deps.events || (!before && !after)) return;
    try {
      await this.deps.events.moneyChanged({
        tripId: expense.tripId,
        expenseId: expense.id,
        kind,
        title: expense.title,
        category: expense.category,
        by: ctx.actor,
        at: ctx.now,
        before,
        after,
      });
    } catch (error) {
      console.error("ledger event listener failed", error);
    }
  }

  private async load(tripId: TripId, expenseId: ExpenseId): Promise<Expense> {
    const expense = await this.deps.expenses.get(expenseId);
    if (!expense || expense.tripId !== tripId) throw notFound("No encontramos ese gasto");
    return expense;
  }

  /** The expense's day where the group is (rates are daily). */
  private static rateDay(at: Date) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(at);
  }

  /** A rate from the provider for a foreign-currency amount, or undefined ("tasa pendiente"). */
  private async fetchFx(currency: string, baseCurrency: string, at: Date): Promise<FxInput | undefined> {
    if (currency === baseCurrency || !this.deps.rates) return undefined;
    try {
      const rate = await this.deps.rates.rateFor(currency, baseCurrency, ExpenseLedgerUseCases.rateDay(at));
      return rate ? { kind: "rate", rate, source: "api" } : undefined;
    } catch (error) {
      console.error("fx rate lookup failed", error);
      return undefined;
    }
  }

  /**
   * The rate a money edit keeps: the frozen one (R: rates never move after creation), or the
   * card charge when the total didn't change. A new currency or a pending rate asks the provider.
   */
  private async keptFx(expense: Expense, input: MoneyInput, baseCurrency: string): Promise<FxInput | undefined> {
    if (input.fx || input.currency === baseCurrency) return input.fx;
    const m = expense.money?.props;
    if (m && m.currency === input.currency && m.fxRate) {
      if (m.fxSource === "card_charge" && m.amount === input.amount && m.baseAmount !== null) {
        return { kind: "card_charge", baseAmount: m.baseAmount };
      }
      return { kind: "rate", rate: m.fxRate, source: m.fxSource === "api" ? "api" : "manual" };
    }
    return this.fetchFx(input.currency, baseCurrency, expense.occurredAt);
  }

  /** Quick add's "≈ $98.000 COP" preview: today's rate from the provider, or null. */
  quoteRate(principalId: PrincipalId, tripId: TripId, currency: string): Promise<Result<{ rate: string | null }>> {
    return attempt(async () => {
      const ctx = await this.context(principalId, tripId);
      if (!isCurrencyCode(currency)) throw validationError("Moneda no soportada");
      const fx = await this.fetchFx(currency, ctx.trip.baseCurrency, ctx.now);
      return { rate: currency === ctx.trip.baseCurrency ? "1" : fx?.kind === "rate" ? fx.rate : null };
    });
  }

  /**
   * Sets a foreign-currency expense's base amount: what the card actually charged, or (without
   * one) the provider's rate for the expense's day, e.g. to settle a "tasa pendiente".
   */
  setExpenseRate(
    principalId: PrincipalId,
    tripId: TripId,
    expenseId: ExpenseId,
    expectedVersion: number,
    input: { cardCharge?: number | null },
  ): Promise<Result<ExpenseDTO>> {
    return attempt(async () => {
      const ctx = await this.context(principalId, tripId);
      const expense = await this.load(tripId, expenseId);
      const m = expense.money?.props;
      if (!m || m.currency === ctx.trip.baseCurrency) throw invalidState("Este gasto está en la moneda del viaje");
      const fx: FxInput | undefined =
        input.cardCharge != null
          ? { kind: "card_charge", baseAmount: input.cardCharge }
          : await this.fetchFx(m.currency, ctx.trip.baseCurrency, expense.occurredAt);
      if (!fx) throw invalidState("No pudimos traer la tasa. Escribe lo que cobró la tarjeta.");
      const effect = expense.effect;
      expense.changeMoney(expectedVersion, { currency: m.currency, amount: m.amount, fx }, ctx);
      await this.deps.expenses.save(expense, expectedVersion);
      await this.publish("edited", expense, ctx, effect);
      return toExpenseDTO(expense, ctx.actor);
    });
  }

  recordExpense(
    principalId: PrincipalId,
    tripId: TripId,
    input: MoneyInput & {
      type?: ExpenseType;
      category?: Category;
      title?: string | null;
      occurredAt?: Date;
      receiptPaths?: string[];
    },
  ): Promise<Result<{ expense: ExpenseDTO; warnings: ExpenseWarning[] }>> {
    return attempt(async () => {
      const ctx = await this.context(principalId, tripId);
      assertReceiptPaths(input.receiptPaths ?? [], tripId);
      const fx = input.fx ?? (await this.fetchFx(input.currency, ctx.trip.baseCurrency, input.occurredAt ?? ctx.now));
      const expense = Expense.record({ ...input, fx, id: ExpenseId(this.deps.ids.next()) }, ctx);
      const others = await this.deps.expenses.listByTrip(tripId);
      await this.deps.expenses.save(expense, null);
      await this.publish("created", expense, ctx, null);
      return { expense: toExpenseDTO(expense, ctx.actor), warnings: evaluateGuards(expense, others) };
    });
  }

  snapReceiptDraft(principalId: PrincipalId, tripId: TripId, receiptPath: string): Promise<Result<ExpenseDTO>> {
    return attempt(async () => {
      const ctx = await this.context(principalId, tripId);
      const expense = Expense.draft({ id: ExpenseId(this.deps.ids.next()), receiptPath }, ctx);
      await this.deps.expenses.save(expense, null);
      return toExpenseDTO(expense, ctx.actor);
    });
  }

  completeDraft(
    principalId: PrincipalId,
    tripId: TripId,
    expenseId: ExpenseId,
    input: MoneyInput & { category?: Category; title?: string | null },
  ): Promise<Result<ExpenseDTO>> {
    return attempt(async () => {
      const ctx = await this.context(principalId, tripId);
      const expense = await this.load(tripId, expenseId);
      const before = expense.moneyVersion;
      const effect = expense.effect;
      expense.completeDraft(input, ctx);
      await this.deps.expenses.save(expense, before);
      await this.publish("created", expense, ctx, effect);
      return toExpenseDTO(expense, ctx.actor);
    });
  }

  editExpenseMoney(
    principalId: PrincipalId,
    tripId: TripId,
    expenseId: ExpenseId,
    expectedVersion: number,
    input: MoneyInput,
  ): Promise<Result<ExpenseDTO>> {
    return attempt(async () => {
      const ctx = await this.context(principalId, tripId);
      const expense = await this.load(tripId, expenseId);
      const effect = expense.effect;
      const fx = await this.keptFx(expense, input, ctx.trip.baseCurrency);
      expense.changeMoney(expectedVersion, { ...input, fx }, ctx);
      await this.deps.expenses.save(expense, expectedVersion);
      await this.publish("edited", expense, ctx, effect);
      return toExpenseDTO(expense, ctx.actor);
    });
  }

  deleteExpense(principalId: PrincipalId, tripId: TripId, expenseId: ExpenseId): Promise<Result<void>> {
    return attempt(async () => {
      const ctx = await this.context(principalId, tripId);
      const expense = await this.load(tripId, expenseId);
      const version = expense.moneyVersion;
      const effect = expense.effect;
      expense.delete(ctx);
      await this.deps.expenses.save(expense, version);
      await this.publish("deleted", expense, ctx, effect);
    });
  }

  listTripExpenses(principalId: PrincipalId, tripId: TripId): Promise<Result<ExpenseDTO[]>> {
    return attempt(async () => {
      const ctx = await this.context(principalId, tripId);
      const all = await this.deps.expenses.listByTrip(tripId);
      return all
        .filter((e) => e.status !== "deleted")
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
        .map((e) => toExpenseDTO(e, ctx.actor));
    });
  }

  /**
   * "Foto de la factura" in quick add: stores the photo under the trip and, when a reader is
   * configured, reads it to pre-fill the form. Nothing is recorded until the person saves.
   */
  scanReceipt(
    principalId: PrincipalId,
    tripId: TripId,
    image: ReceiptImage,
  ): Promise<Result<ReceiptPrefill & { receiptPath: string; read: boolean }>> {
    return attempt(async () => {
      const ctx = await this.context(principalId, tripId);
      if (ctx.trip.status === "closed") throw invalidState("El viaje está cerrado");
      assertReceiptImage(image);
      const receiptPath = await this.deps.receipts.put(tripId, this.deps.ids.next(), image);
      if (!this.deps.reader) {
        return { receiptPath, read: false, amount: null, currency: null, title: null, category: null, note: null };
      }
      let reading = null;
      try {
        reading = await this.deps.reader.read(image, { baseCurrency: ctx.trip.baseCurrency });
      } catch (error) {
        // The photo is already stored and stays attached; the person just types the amount.
        console.error("receipt reader failed", error);
      }
      return { receiptPath, read: reading !== null, ...prefillFromReading(reading, ctx.trip.baseCurrency) };
    });
  }

  /** One expense with its split method and full history (Gastos › detalle). */
  getExpense(principalId: PrincipalId, tripId: TripId, expenseId: ExpenseId): Promise<Result<ExpenseDetailDTO>> {
    return attempt(async () => {
      const ctx = await this.context(principalId, tripId);
      const expense = await this.load(tripId, expenseId);
      if (expense.status === "deleted") throw notFound("Este gasto fue borrado");
      const p = expense.toPrimitives();
      return {
        ...toExpenseDTO(expense, ctx.actor),
        splitMethod: p.money?.splitMethod ?? null,
        notes: p.notes,
        history: p.history.map((h) => ({ at: h.at.toISOString(), by: h.by, kind: h.kind, moneyVersion: h.moneyVersion })),
      };
    });
  }

  /** A short-lived link to an expense's receipt photo, for members of the trip. */
  receiptUrl(principalId: PrincipalId, tripId: TripId, expenseId: ExpenseId, index = 0): Promise<Result<string>> {
    return attempt(async () => {
      await this.context(principalId, tripId);
      const expense = await this.load(tripId, expenseId);
      const path = expense.toPrimitives().receiptPaths[index];
      const url = path ? await this.deps.receipts.signedUrl(path) : null;
      if (!url) throw notFound("Este gasto no tiene soporte");
      return url;
    });
  }

  /** Split presets for quick add: the smart default, "Igual que el último" and saved groups. */
  getQuickAddDefaults(principalId: PrincipalId, tripId: TripId): Promise<Result<QuickAddDefaultsDTO>> {
    return attempt(async () => {
      const ctx = await this.context(principalId, tripId);
      const [expenses, groups] = await Promise.all([
        this.deps.expenses.listByTrip(tripId),
        this.deps.splitGroups.listByTrip(tripId),
      ]);
      return { ...suggestSplit(expenses, ctx.trip, ctx.now), groups: this.groupDTOs(groups, ctx) };
    });
  }

  saveSplitGroup(principalId: PrincipalId, tripId: TripId, input: { name: string; seatIds: SeatId[] }): Promise<Result<SplitGroupDTO>> {
    return attempt(async () => {
      const ctx = await this.context(principalId, tripId);
      const existing = await this.deps.splitGroups.listByTrip(tripId);
      const group = SplitGroup.create({ id: SplitGroupId(this.deps.ids.next()), ...input }, ctx, existing);
      await this.deps.splitGroups.add(group);
      return this.groupDTOs([group], ctx)[0];
    });
  }

  deleteSplitGroup(principalId: PrincipalId, tripId: TripId, id: SplitGroupId): Promise<Result<void>> {
    return attempt(async () => {
      const ctx = await this.context(principalId, tripId);
      const group = (await this.deps.splitGroups.listByTrip(tripId)).find((g) => g.id === id);
      if (!group) throw notFound("No encontramos ese grupo");
      group.assertCanDelete(ctx);
      await this.deps.splitGroups.delete(tripId, id);
    });
  }

  private groupDTOs(groups: SplitGroup[], ctx: Context): SplitGroupDTO[] {
    return groups.flatMap((g) => {
      const seatIds = g.activeSeats(ctx);
      if (seatIds.length < 2) return [];
      let canDelete = true;
      try {
        g.assertCanDelete(ctx);
      } catch {
        canDelete = false;
      }
      return [{ id: g.id, name: g.name, seatIds, canDelete }];
    });
  }
}
