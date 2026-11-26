import { DAY } from "@/shared-kernel/clock";
import { forbidden, invalidState, validationError } from "@/shared-kernel/errors";
import type { SeatId, SettlementId, TripId } from "@/shared-kernel/ids";
import { isCurrencyCode, type CurrencyCode } from "@/shared-kernel/money/currency";
import { assertUnits } from "@/shared-kernel/money/money";

export const SETTLEMENT_METHODS = ["cash", "breb", "nequi", "daviplata", "bank", "paypal", "offset"] as const;
export type SettlementMethod = (typeof SETTLEMENT_METHODS)[number];
export type SettlementStatus = "pending" | "confirmed" | "disputed" | "reversed";

export const AUTO_CONFIRM_AFTER = 3 * DAY;

export interface SettlementProps {
  id: SettlementId;
  tripId: TripId;
  from: SeatId;
  to: SeatId;
  amount: number;
  currency: CurrencyCode;
  baseAmount: number;
  method: SettlementMethod;
  note: string | null;
  recordedBy: SeatId;
  recordedAt: Date;
  status: SettlementStatus;
  resolvedAt: Date | null;
  resolvedBy: SeatId | null;
}

export interface Actor {
  readonly seatId: SeatId;
  readonly isAdmin: boolean;
}

/**
 * Aggregate: money a seat says it paid to another.
 * State machine: pending → confirmed | disputed; disputed → pending; confirmed → reversed.
 */
export class Settlement {
  private constructor(private props: SettlementProps) {}

  static record(
    input: {
      id: SettlementId;
      tripId: TripId;
      from: SeatId;
      to: SeatId;
      amount: number;
      currency: string;
      baseAmount: number;
      method: string;
      note?: string | null;
    },
    actor: Actor,
    now: Date,
  ): Settlement {
    if (input.from === input.to) throw validationError("No puedes pagarte a ti mismo");
    const involved = actor.seatId === input.from || actor.seatId === input.to;
    if (!involved && !actor.isAdmin) throw forbidden("Solo puedes registrar pagos que hiciste o recibiste");
    if (!isCurrencyCode(input.currency)) throw validationError("Moneda no soportada");
    if (!(SETTLEMENT_METHODS as readonly string[]).includes(input.method)) throw validationError("Método desconocido");
    const amount = assertUnits(input.amount);
    const baseAmount = assertUnits(input.baseAmount, "baseAmount");
    if (amount <= 0 || baseAmount <= 0) throw validationError("El pago debe ser mayor que cero");
    const note = input.note?.trim() || null;
    if (input.method === "offset" && !note) throw validationError("Explica la compensación en una nota");

    const receiverRecorded = actor.seatId === input.to;
    return new Settlement({
      id: input.id,
      tripId: input.tripId,
      from: input.from,
      to: input.to,
      amount,
      currency: input.currency,
      baseAmount,
      method: input.method as SettlementMethod,
      note,
      recordedBy: actor.seatId,
      recordedAt: now,
      status: receiverRecorded ? "confirmed" : "pending",
      resolvedAt: receiverRecorded ? now : null,
      resolvedBy: receiverRecorded ? actor.seatId : null,
    });
  }

  static fromPrimitives(props: SettlementProps): Settlement {
    return new Settlement({ ...props });
  }

  confirm(actor: Actor, now: Date) {
    if (actor.seatId !== this.props.to) throw forbidden("Solo quien recibe confirma el pago");
    if (this.props.status !== "pending") throw invalidState("Este pago no está pendiente");
    this.resolve("confirmed", actor.seatId, now);
  }

  /** "No me llegó". */
  dispute(actor: Actor, now: Date) {
    if (actor.seatId !== this.props.to) throw forbidden("Solo quien recibe puede decir que no le llegó");
    if (this.props.status !== "pending") throw invalidState("Este pago no está pendiente");
    this.resolve("disputed", actor.seatId, now);
  }

  resend(actor: Actor, now: Date) {
    if (actor.seatId !== this.props.from) throw forbidden("Solo quien pagó puede reenviar");
    if (this.props.status !== "disputed") throw invalidState("Este pago no está en disputa");
    this.props.status = "pending";
    this.props.recordedAt = now;
    this.props.resolvedAt = null;
    this.props.resolvedBy = null;
  }

  /** Lazily applied on read or by a scheduled job. Returns true if it changed. */
  autoConfirmIfDue(now: Date): boolean {
    if (this.props.status !== "pending") return false;
    if (now.getTime() - this.props.recordedAt.getTime() < AUTO_CONFIRM_AFTER) return false;
    this.resolve("confirmed", null, now);
    return true;
  }

  /** Corrections never edit a confirmed payment: an admin reverses it. */
  reverse(actor: Actor, now: Date) {
    if (!actor.isAdmin) throw forbidden("Solo el organizador o un admin puede revertir un pago");
    if (this.props.status !== "confirmed") throw invalidState("Solo se revierten pagos confirmados");
    this.resolve("reversed", actor.seatId, now);
  }

  private resolve(status: SettlementStatus, by: SeatId | null, now: Date) {
    this.props.status = status;
    this.props.resolvedAt = now;
    this.props.resolvedBy = by;
  }

  get id() {
    return this.props.id;
  }
  get from() {
    return this.props.from;
  }
  get to() {
    return this.props.to;
  }
  get baseAmount() {
    return this.props.baseAmount;
  }
  get status() {
    return this.props.status;
  }
  get recordedAt() {
    return this.props.recordedAt;
  }

  toPrimitives(): SettlementProps {
    return { ...this.props };
  }
}
