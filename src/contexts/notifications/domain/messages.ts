import { isCurrencyCode } from "@/shared-kernel/money/currency";
import { formatMoney } from "@/shared-kernel/money/money";
import type { PrincipalId, SeatId, TripId } from "@/shared-kernel/ids";

/**
 * Quiet by default (PRODUCT_SPEC §6.9): only what needs someone *now* is pushed right away; the
 * rest waits for the evening digest. This module decides who hears what, in which words.
 */

/** Who is in a trip, as notifications sees it. Only linked seats (with a person behind) can hear. */
export interface TripDirectory {
  readonly tripId: TripId;
  readonly tripName: string;
  readonly baseCurrency: string;
  readonly seats: ReadonlyArray<{
    readonly seatId: SeatId;
    readonly name: string;
    readonly principalId: PrincipalId | null;
    readonly isAdmin: boolean;
  }>;
}

export interface PushMessage {
  readonly title: string;
  readonly body: string;
  /** Opened on tap (same origin). */
  readonly url: string;
  /** Same tag replaces the previous one on the phone instead of stacking. */
  readonly tag: string;
}

export interface Delivery {
  readonly to: PrincipalId;
  readonly message: PushMessage;
}

const money = (units: number, currency: string) => (isCurrencyCode(currency) ? formatMoney(units, currency) : String(units));
const nameOf = (dir: TripDirectory, seat: SeatId) => dir.seats.find((s) => s.seatId === seat)?.name ?? "Alguien";
const linked = (dir: TripDirectory) => dir.seats.filter((s): s is typeof s & { principalId: PrincipalId } => s.principalId !== null);
const base = (dir: TripDirectory) => `/t/${dir.tripId}`;

const CATEGORY_LABELS: Record<string, string> = {
  comida: "Comida",
  transporte: "Transporte",
  super: "Súper",
  tragos: "Tragos",
  alojamiento: "Alojamiento",
  planes: "Planes",
  otro: "Otro",
};
/** An untitled expense is named by its category ("Transporte"). */
export const categoryLabel = (category: string) => CATEGORY_LABELS[category] ?? "Un gasto";

/** A share (or payment) moved by this much, relative to what it was, counts as "changed" (§6.9: >10%). */
export const SHARE_CHANGE_THRESHOLD = 0.1;

export interface MoneyChange {
  readonly by: SeatId;
  readonly kind: "created" | "edited" | "deleted";
  readonly what: string;
  readonly expenseId: string;
  /** Per seat, in base units: what they owed and paid before and after. */
  readonly seats: ReadonlyArray<{ seatId: SeatId; shareBefore: number; shareAfter: number; paidBefore: number; paidAfter: number }>;
}

/**
 * Edits and deletions that move someone's share by more than 10%, and any payment recorded or
 * removed in someone else's name. New expenses on their own go to the digest.
 */
export function moneyChangeDeliveries(dir: TripDirectory, change: MoneyChange): Delivery[] {
  const by = nameOf(dir, change.by);
  const url = change.kind === "deleted" ? `${base(dir)}/gastos` : `${base(dir)}/gastos/${change.expenseId}`;
  return linked(dir).flatMap((seat): Delivery[] => {
    if (seat.seatId === change.by) return [];
    const s = change.seats.find((x) => x.seatId === seat.seatId);
    if (!s) return [];
    const tag = `expense-${change.expenseId}`;
    if (s.paidBefore !== s.paidAfter) {
      const body =
        s.paidBefore === 0
          ? `${by} anotó que pagaste ${money(s.paidAfter, dir.baseCurrency)} · ${change.what}`
          : s.paidAfter === 0
            ? `${by} quitó tu pago de ${money(s.paidBefore, dir.baseCurrency)} · ${change.what}`
            : `${by} cambió lo que pagaste: ${money(s.paidAfter, dir.baseCurrency)} · ${change.what}`;
      return [{ to: seat.principalId, message: { title: dir.tripName, body, url, tag } }];
    }
    if (change.kind === "created" || s.shareBefore === 0) return [];
    if (Math.abs(s.shareAfter - s.shareBefore) / s.shareBefore <= SHARE_CHANGE_THRESHOLD) return [];
    const body =
      change.kind === "deleted" || s.shareAfter === 0
        ? `${change.what}: ya no te toca (antes ${money(s.shareBefore, dir.baseCurrency)}), por ${by}`
        : `${change.what}: tu parte ${money(s.shareBefore, dir.baseCurrency)} → ${money(s.shareAfter, dir.baseCurrency)}, editado por ${by}`;
    return [{ to: seat.principalId, message: { title: dir.tripName, body, url, tag } }];
  });
}

/** "Ya pagué": the receiver has a payment to confirm. */
export function settlementToConfirm(dir: TripDirectory, from: SeatId, to: SeatId, amount: number, potHolder?: SeatId): Delivery[] {
  const target = dir.seats.find((s) => s.seatId === (potHolder ?? to));
  if (!target?.principalId) return [];
  const body = potHolder
    ? `${nameOf(dir, from)} dice que puso ${money(amount, dir.baseCurrency)} en la vaca. Confírmalo.`
    : `${nameOf(dir, from)} dice que te pagó ${money(amount, dir.baseCurrency)}. Confírmalo.`;
  return [{ to: target.principalId, message: { title: dir.tripName, body, url: `${base(dir)}/cuentas`, tag: `settle-${from}-${to}` } }];
}

/** Someone asked to join through the group link: admins approve. */
export function joinRequested(dir: TripDirectory, name: string): Delivery[] {
  return linked(dir)
    .filter((s) => s.isAdmin)
    .map((s) => ({ to: s.principalId, message: { title: dir.tripName, body: `${name} quiere entrar al viaje`, url: `${base(dir)}/viaje`, tag: "join" } }));
}

/** The trip moves to Liquidando: everyone but whoever started it. */
export function settlingStarted(dir: TripDirectory, by: SeatId): Delivery[] {
  return linked(dir)
    .filter((s) => s.seatId !== by)
    .map((s) => ({
      to: s.principalId,
      message: { title: dir.tripName, body: `${nameOf(dir, by)} empezó a liquidar. Revisa tu parte y mira a quién pagarle.`, url: base(dir), tag: "settling" },
    }));
}

/** "Revisa tu parte" with a question: the organizers answer. */
export function shareQuestion(dir: TripDirectory, from: SeatId, note: string): Delivery[] {
  return linked(dir)
    .filter((s) => s.isAdmin && s.seatId !== from)
    .map((s) => ({
      to: s.principalId,
      message: { title: dir.tripName, body: `${nameOf(dir, from)} pregunta: “${note.slice(0, 90)}”`, url: `${base(dir)}/cuentas`, tag: `question-${from}` },
    }));
}

/** R14 while Liquidando: a change waits for an admin. */
export function changeToApprove(dir: TripDirectory, by: SeatId, what: string): Delivery[] {
  return linked(dir)
    .filter((s) => s.isAdmin && s.seatId !== by)
    .map((s) => ({
      to: s.principalId,
      message: { title: dir.tripName, body: `${nameOf(dir, by)} cambió ${what}: falta tu aprobación`, url: `${base(dir)}/cuentas`, tag: "held" },
    }));
}

/** The evening digest for one person in one trip: "Hoy en Cartagena: 7 gastos · vas en −$230.000". */
export function digestMessage(dir: TripDirectory, expensesToday: number, balance: number): PushMessage {
  const count = expensesToday === 1 ? "1 gasto" : `${expensesToday} gastos`;
  const where =
    balance < 0 ? `debes ${money(-balance, dir.baseCurrency)}` : balance > 0 ? `te deben ${money(balance, dir.baseCurrency)}` : "estás a paz y salvo";
  return { title: `Hoy en ${dir.tripName}`, body: `${count} · ${where}`, url: base(dir), tag: "digest" };
}
