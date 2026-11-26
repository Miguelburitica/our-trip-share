import { conflict, forbidden, invalidState, validationError } from "@/shared-kernel/errors";
import type { ExpenseId, SeatId, TripId } from "@/shared-kernel/ids";
import { MoneyBlock, type FxInput, type MoneyBlockProps, type SplitInput } from "./money-block";
import { defaultParticipants, isAdminSeat, isTripSeat, type LedgerTripView } from "./trip-view";

export const CATEGORIES = ["comida", "transporte", "super", "tragos", "alojamiento", "planes", "otro"] as const;
export type Category = (typeof CATEGORIES)[number];
export type ExpenseType = "expense" | "money_received";
export type ExpenseStatus = "draft" | "complete" | "deleted";

export interface ExpenseChange {
  readonly at: Date;
  readonly by: SeatId;
  readonly kind: "created" | "drafted" | "completed" | "money_changed" | "details_changed" | "deleted";
  readonly moneyVersion: number;
  readonly summary?: string;
}

export interface ExpenseProps {
  id: ExpenseId;
  tripId: TripId;
  type: ExpenseType;
  status: ExpenseStatus;
  category: Category;
  title: string | null;
  notes: string | null;
  occurredAt: Date;
  money: MoneyBlockProps | null;
  moneyVersion: number;
  receiptPaths: string[];
  createdBy: SeatId;
  createdAt: Date;
  updatedAt: Date;
  history: ExpenseChange[];
}

export interface ExpenseEffect {
  readonly sign: 1 | -1;
  readonly payers: ReadonlyArray<{ readonly seatId: SeatId; readonly base: number }>;
  readonly shares: ReadonlyArray<{ readonly seatId: SeatId; readonly base: number }>;
}

export interface MoneyInput {
  currency: string;
  amount: number;
  fx?: FxInput;
  /** Defaults to the actor paying everything. */
  payers?: ReadonlyArray<{ seatId: SeatId; amount?: number }>;
  /** Defaults to an equal split among the trip's default participants. */
  split?: SplitInput;
}

export interface Context {
  readonly actor: SeatId;
  readonly trip: LedgerTripView;
  readonly now: Date;
}

export interface RecordExpenseInput extends MoneyInput {
  id: ExpenseId;
  type?: ExpenseType;
  category?: Category;
  title?: string | null;
  notes?: string | null;
  occurredAt?: Date;
  receiptPaths?: string[];
}

const cleanText = (value: string | null | undefined, max: number) => {
  const v = value?.trim().replace(/\s+/g, " ") ?? "";
  if (v.length > max) throw validationError("Texto demasiado largo");
  return v || null;
};

/** Aggregate root of the expense-ledger context. */
export class Expense {
  private constructor(private props: ExpenseProps) {}

  // ---------- factories ----------

  static record(input: RecordExpenseInput, ctx: Context): Expense {
    Expense.assertWritable(ctx);
    const money = Expense.buildMoney(input.id, input, ctx);
    return new Expense({
      id: input.id,
      tripId: ctx.trip.tripId,
      type: input.type ?? "expense",
      status: "complete",
      category: Expense.category(input.category),
      title: cleanText(input.title, 80),
      notes: cleanText(input.notes, 500),
      occurredAt: input.occurredAt ?? ctx.now,
      money: money.props,
      moneyVersion: 1,
      receiptPaths: input.receiptPaths ?? [],
      createdBy: ctx.actor,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      history: [{ at: ctx.now, by: ctx.actor, kind: "created", moneyVersion: 1 }],
    });
  }

  /** Receipt-first capture: a photo and no amount. Doesn't affect balances. */
  static draft(input: { id: ExpenseId; receiptPath: string; occurredAt?: Date }, ctx: Context): Expense {
    Expense.assertWritable(ctx);
    if (!input.receiptPath) throw validationError("El borrador necesita la foto del recibo");
    return new Expense({
      id: input.id,
      tripId: ctx.trip.tripId,
      type: "expense",
      status: "draft",
      category: "otro",
      title: null,
      notes: null,
      occurredAt: input.occurredAt ?? ctx.now,
      money: null,
      moneyVersion: 0,
      receiptPaths: [input.receiptPath],
      createdBy: ctx.actor,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      history: [{ at: ctx.now, by: ctx.actor, kind: "drafted", moneyVersion: 0 }],
    });
  }

  static fromPrimitives(props: ExpenseProps): Expense {
    return new Expense({ ...props, history: [...props.history], receiptPaths: [...props.receiptPaths] });
  }

  // ---------- commands ----------

  completeDraft(input: MoneyInput & { category?: Category; title?: string | null }, ctx: Context) {
    Expense.assertWritable(ctx);
    if (this.props.status !== "draft") throw invalidState("Este gasto no es un borrador");
    const money = Expense.buildMoney(this.props.id, input, ctx);
    this.props.money = money.props;
    this.props.moneyVersion = 1;
    this.props.status = "complete";
    if (input.category) this.props.category = Expense.category(input.category);
    if (input.title !== undefined) this.props.title = cleanText(input.title, 80);
    this.touch(ctx, "completed");
  }

  /** Replaces the whole money block, only if the editor saw the current version. */
  changeMoney(expectedVersion: number, input: MoneyInput, ctx: Context) {
    Expense.assertWritable(ctx);
    if (this.props.status !== "complete" || !this.props.money) throw invalidState("Este gasto no se puede editar");
    if (expectedVersion !== this.props.moneyVersion) {
      throw conflict("Alguien editó este gasto mientras tanto", {
        expectedVersion,
        currentVersion: this.props.moneyVersion,
      });
    }
    const current = MoneyBlock.fromPrimitives(this.props.money);
    // What the edit doesn't mention is kept. A single payer keeps paying everything;
    // an equal split keeps its participants (exact splits must be re-sent with a new amount).
    const keptPayers =
      current.props.payers.length === 1
        ? [{ seatId: current.props.payers[0].seatId }]
        : current.props.payers.map((p) => ({ seatId: p.seatId, amount: p.amount }));
    const keptSplit: SplitInput =
      current.props.splitMethod === "equal"
        ? { method: "equal", participants: current.participantIds }
        : { method: "exact", shares: current.props.shares.map((s) => ({ seatId: s.seatId, amount: s.amount })) };
    const next = Expense.buildMoney(
      this.props.id,
      { ...input, payers: input.payers ?? keptPayers, split: input.split ?? keptSplit },
      ctx,
    );
    const before = new Set(current.payerIds);
    const after = new Set(next.payerIds);
    const payerChanged = before.size !== after.size || [...before].some((p) => !after.has(p));
    if (payerChanged && !before.has(ctx.actor) && !after.has(ctx.actor) && !isAdminSeat(ctx.trip, ctx.actor)) {
      throw forbidden("Solo quien pagó, el nuevo pagador o un admin puede cambiar quién pagó");
    }
    this.props.money = next.props;
    this.props.moneyVersion += 1;
    this.touch(ctx, "money_changed");
  }

  changeDetails(
    patch: { category?: Category; title?: string | null; notes?: string | null; occurredAt?: Date },
    ctx: Context,
  ) {
    Expense.assertWritable(ctx);
    if (this.props.status === "deleted") throw invalidState("Este gasto fue borrado");
    if (patch.category !== undefined) this.props.category = Expense.category(patch.category);
    if (patch.title !== undefined) this.props.title = cleanText(patch.title, 80);
    if (patch.notes !== undefined) this.props.notes = cleanText(patch.notes, 500);
    if (patch.occurredAt !== undefined) this.props.occurredAt = patch.occurredAt;
    this.touch(ctx, "details_changed");
  }

  delete(ctx: Context) {
    Expense.assertWritable(ctx);
    if (this.props.status === "deleted") return;
    this.props.status = "deleted";
    this.touch(ctx, "deleted");
  }

  // ---------- queries ----------

  get id() {
    return this.props.id;
  }
  get tripId() {
    return this.props.tripId;
  }
  get status() {
    return this.props.status;
  }
  get type() {
    return this.props.type;
  }
  get category() {
    return this.props.category;
  }
  get title() {
    return this.props.title;
  }
  get occurredAt() {
    return this.props.occurredAt;
  }
  get createdBy() {
    return this.props.createdBy;
  }
  get moneyVersion() {
    return this.props.moneyVersion;
  }
  get history(): readonly ExpenseChange[] {
    return this.props.history;
  }
  get money(): MoneyBlock | null {
    return this.props.money ? MoneyBlock.fromPrimitives(this.props.money) : null;
  }
  /** Complete, not deleted, and with a known base amount. */
  get countsTowardBalances(): boolean {
    return this.props.status === "complete" && this.props.money !== null && this.props.money.baseAmount !== null;
  }
  /** What this expense adds to balances, in base units; null while it doesn't count. */
  get effect(): ExpenseEffect | null {
    if (!this.countsTowardBalances) return null;
    const m = this.props.money!;
    return {
      sign: this.sign,
      payers: m.payers.map((x) => ({ seatId: x.seatId, base: x.baseAmount! })),
      shares: m.shares.map((x) => ({ seatId: x.seatId, base: x.baseAmount! })),
    };
  }
  /** +1 for expenses, −1 for money received (refunds, deposits back). */
  get sign(): 1 | -1 {
    return this.props.type === "money_received" ? -1 : 1;
  }

  toPrimitives(): ExpenseProps {
    return { ...this.props, history: [...this.props.history], receiptPaths: [...this.props.receiptPaths] };
  }

  // ---------- helpers ----------

  private touch(ctx: Context, kind: ExpenseChange["kind"]) {
    this.props.updatedAt = ctx.now;
    this.props.history.push({ at: ctx.now, by: ctx.actor, kind, moneyVersion: this.props.moneyVersion });
  }

  private static assertWritable(ctx: Context) {
    if (ctx.trip.status === "closed") throw invalidState("El viaje está cerrado");
    if (!isTripSeat(ctx.trip, ctx.actor)) throw forbidden("No eres parte de este viaje");
  }

  private static category(value: string | undefined): Category {
    if (value === undefined) return "otro";
    if (!(CATEGORIES as readonly string[]).includes(value)) throw validationError("Categoría desconocida");
    return value as Category;
  }

  private static buildMoney(expenseId: ExpenseId, input: MoneyInput, ctx: Context): MoneyBlock {
    const payers = input.payers ?? [{ seatId: ctx.actor }];
    const split: SplitInput = input.split ?? { method: "equal", participants: defaultParticipants(ctx.trip) };
    const seats = [
      ...payers.map((p) => p.seatId),
      ...(split.method === "equal" ? split.participants : split.shares.map((s) => s.seatId)),
    ];
    for (const seatId of seats) {
      if (!isTripSeat(ctx.trip, seatId)) throw validationError("Esa persona no está en el viaje", { seatId });
    }
    return MoneyBlock.create({
      expenseId,
      currency: input.currency,
      baseCurrency: ctx.trip.baseCurrency,
      amount: input.amount,
      fx: input.fx,
      payers,
      split,
    });
  }
}
