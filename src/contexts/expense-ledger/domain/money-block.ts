import { validationError } from "@/shared-kernel/errors";
import type { ExpenseId, SeatId } from "@/shared-kernel/ids";
import { allocate, splitEqually } from "@/shared-kernel/money/allocate";
import { isCurrencyCode, type CurrencyCode } from "@/shared-kernel/money/currency";
import { FxRate } from "@/shared-kernel/money/fx-rate";
import { assertUnits, sum } from "@/shared-kernel/money/money";

export type SplitMethod = "equal" | "exact";
export type FxSource = "same_currency" | "api" | "manual" | "card_charge";

export type SplitInput =
  | { readonly method: "equal"; readonly participants: readonly SeatId[] }
  | { readonly method: "exact"; readonly shares: ReadonlyArray<{ seatId: SeatId; amount: number }> };

export type FxInput =
  | { readonly kind: "rate"; readonly rate: string; readonly source: "api" | "manual" }
  | { readonly kind: "card_charge"; readonly baseAmount: number };

export interface MoneyBlockInput {
  readonly expenseId: ExpenseId;
  readonly currency: string;
  readonly baseCurrency: CurrencyCode;
  readonly amount: number;
  /** Required when currency ≠ base currency; without it the block is "rate pending". */
  readonly fx?: FxInput;
  /** One payer may omit its amount (it pays everything). */
  readonly payers: ReadonlyArray<{ seatId: SeatId; amount?: number }>;
  readonly split: SplitInput;
}

export interface Portion {
  readonly seatId: SeatId;
  readonly amount: number;
  /** Null while the rate is pending. */
  readonly baseAmount: number | null;
}

export interface MoneyBlockProps {
  readonly currency: CurrencyCode;
  readonly baseCurrency: CurrencyCode;
  readonly amount: number;
  readonly fxRate: string | null;
  readonly fxSource: FxSource | null;
  readonly baseAmount: number | null;
  readonly splitMethod: SplitMethod;
  readonly payers: readonly Portion[];
  readonly shares: readonly Portion[];
}

const tieKey = (expenseId: ExpenseId, seatId: SeatId) => `${expenseId}:${seatId}`;

function assertDistinct(ids: readonly SeatId[], label: string) {
  if (new Set(ids).size !== ids.length) throw validationError(`${label} repetidos`);
}

/**
 * Immutable value object holding everything about an expense's money.
 * It can only be built valid: every amount is an integer and every column sums exactly.
 */
export class MoneyBlock {
  private constructor(readonly props: MoneyBlockProps) {}

  static create(input: MoneyBlockInput): MoneyBlock {
    if (!isCurrencyCode(input.currency)) throw validationError("Moneda no soportada", { currency: input.currency });
    const currency = input.currency;
    const amount = assertUnits(input.amount);
    if (amount <= 0) throw validationError("El monto debe ser mayor que cero");

    // --- shares
    let shareSeats: SeatId[];
    let shareAmounts: number[];
    if (input.split.method === "equal") {
      shareSeats = [...input.split.participants];
      if (shareSeats.length === 0) throw validationError("Elige al menos una persona");
      assertDistinct(shareSeats, "Participantes");
      shareAmounts = splitEqually(amount, shareSeats.map((s) => tieKey(input.expenseId, s)));
    } else {
      const shares = input.split.shares;
      if (shares.length === 0) throw validationError("Elige al menos una persona");
      shareSeats = shares.map((s) => s.seatId);
      assertDistinct(shareSeats, "Participantes");
      shareAmounts = shares.map((s) => assertUnits(s.amount));
      if (shareAmounts.some((a) => a < 0)) throw validationError("Las partes no pueden ser negativas");
      const missing = amount - sum(shareAmounts);
      if (missing !== 0) throw validationError("Las partes no suman el total", { missing });
    }

    // --- payers
    if (input.payers.length === 0) throw validationError("¿Quién pagó?");
    assertDistinct(input.payers.map((p) => p.seatId), "Pagadores");
    let payerAmounts: number[];
    if (input.payers.length === 1 && input.payers[0].amount === undefined) {
      payerAmounts = [amount];
    } else {
      payerAmounts = input.payers.map((p) => {
        if (p.amount === undefined) throw validationError("Cada pagador necesita un monto");
        const a = assertUnits(p.amount);
        if (a <= 0) throw validationError("Cada pagador debe pagar algo");
        return a;
      });
      const missing = amount - sum(payerAmounts);
      if (missing !== 0) throw validationError("Los pagos no suman el total", { missing });
    }
    const payerSeats = input.payers.map((p) => p.seatId);

    // --- base currency
    let fxRate: FxRate | null = null;
    let fxSource: FxSource | null = null;
    let baseAmount: number | null = null;
    if (currency === input.baseCurrency) {
      fxRate = FxRate.one();
      fxSource = "same_currency";
      baseAmount = amount;
    } else if (input.fx?.kind === "rate") {
      fxRate = FxRate.parse(input.fx.rate);
      fxSource = input.fx.source;
      baseAmount = fxRate.convert(amount, currency, input.baseCurrency);
    } else if (input.fx?.kind === "card_charge") {
      const charge = assertUnits(input.fx.baseAmount);
      fxRate = FxRate.fromCharge(amount, currency, charge, input.baseCurrency);
      fxSource = "card_charge";
      baseAmount = charge;
    }

    const toPortions = (seats: SeatId[], amounts: number[]): Portion[] => {
      const bases =
        baseAmount === null
          ? seats.map(() => null)
          : allocate(baseAmount, amounts, seats.map((s) => tieKey(input.expenseId, s)));
      return seats.map((seatId, i) => ({ seatId, amount: amounts[i], baseAmount: bases[i] }));
    };

    return new MoneyBlock({
      currency,
      baseCurrency: input.baseCurrency,
      amount,
      fxRate: fxRate?.toString() ?? null,
      fxSource,
      baseAmount,
      splitMethod: input.split.method,
      payers: toPortions(payerSeats, payerAmounts),
      shares: toPortions(shareSeats, shareAmounts),
    });
  }

  static fromPrimitives(props: MoneyBlockProps): MoneyBlock {
    return new MoneyBlock(props);
  }

  get ratePending(): boolean {
    return this.props.baseAmount === null;
  }
  get participantIds(): SeatId[] {
    return this.props.shares.map((s) => s.seatId);
  }
  get payerIds(): SeatId[] {
    return this.props.payers.map((p) => p.seatId);
  }
  /** The only participant is the only payer: no balance changes. */
  get isPersonal(): boolean {
    return this.props.payers.length === 1 && this.props.shares.length === 1 && this.props.payers[0].seatId === this.props.shares[0].seatId;
  }
  shareOf(seatId: SeatId): Portion | undefined {
    return this.props.shares.find((s) => s.seatId === seatId);
  }
  seatIds(): SeatId[] {
    return [...new Set([...this.payerIds, ...this.participantIds])];
  }
}
