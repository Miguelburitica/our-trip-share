"use server";

import { revalidatePath } from "next/cache";
import { ERROR_COPY as COPY } from "@/app/ui/copy";
import { requirePrincipal } from "@/composition/auth";
import { getContainer } from "@/composition/server";
import { SeatId, SettlementId, TripId } from "@/shared-kernel/ids";
import type { Result } from "@/shared-kernel/result";

export type SettleResult = { ok: true; warning?: string } | { ok: false; message: string };

function done<T>(tripId: string, r: Result<T>, warning?: (v: T) => string | undefined): SettleResult {
  if (!r.ok) return { ok: false, message: r.error.message || COPY[r.error.code] };
  revalidatePath(`/t/${tripId}`, "layout");
  return { ok: true, warning: warning?.(r.value) };
}

/**
 * "Ya pagué" (sender, pending) and "Ya me pagó" (receiver, confirmed). Input is untrusted: the
 * settlement context checks that the caller is one of the two seats and validates the method.
 */
export async function recordSettlementAction(input: {
  tripId: string;
  from: string;
  to: string;
  amount: number;
  method: string;
}): Promise<SettleResult> {
  const { id: principal } = await requirePrincipal();
  const c = await getContainer();
  const r = await c.settlement.recordSettlement(principal, TripId(input.tripId), {
    from: SeatId(String(input.from)),
    to: SeatId(String(input.to)),
    amount: Number(input.amount),
    method: String(input.method),
  });
  return done(input.tripId, r, (v) => (v.overpaymentCredit > 0 ? "Queda un saldo a favor" : undefined));
}

export async function confirmSettlementAction(tripId: string, id: string): Promise<SettleResult> {
  const { id: principal } = await requirePrincipal();
  const c = await getContainer();
  return done(tripId, await c.settlement.confirmSettlement(principal, TripId(tripId), SettlementId(String(id))));
}

export async function disputeSettlementAction(tripId: string, id: string): Promise<SettleResult> {
  const { id: principal } = await requirePrincipal();
  const c = await getContainer();
  return done(tripId, await c.settlement.disputeSettlement(principal, TripId(tripId), SettlementId(String(id))));
}

/** "Empezar a liquidar": the trip moves to Liquidando and the plan freezes (R9). */
export async function startSettlingAction(tripId: string): Promise<SettleResult> {
  const { id: principal } = await requirePrincipal();
  const c = await getContainer();
  const started = await c.membership.startSettling(principal, TripId(tripId));
  if (!started.ok) return done(tripId, started);
  // If this fails the plan still freezes on the next read of Cuentas.
  await c.settlement.freezePlan(principal, TripId(tripId));
  return done(tripId, started);
}

const BLOCKER_COPY: Record<string, (n: number) => string> = {
  drafts: (n) => (n === 1 ? "Hay 1 recibo sin monto" : `Hay ${n} recibos sin monto`),
  pendingSettlements: (n) => (n === 1 ? "Hay 1 pago por confirmar" : `Hay ${n} pagos por confirmar`),
  pendingApprovals: (n) => (n === 1 ? "Hay 1 cambio por aprobar" : `Hay ${n} cambios por aprobar`),
};

export async function closeTripAction(tripId: string): Promise<SettleResult> {
  const { id: principal } = await requirePrincipal();
  const c = await getContainer();
  const r = await c.membership.closeTrip(principal, TripId(tripId));
  if (!r.ok && r.error.code === "invalid_state" && Object.keys(r.error.details).length > 0) {
    const lines = Object.entries(r.error.details).map(([k, n]) => BLOCKER_COPY[k]?.(Number(n)) ?? k);
    return { ok: false, message: lines.join(". ") };
  }
  return done(tripId, r);
}

export async function reopenTripAction(tripId: string): Promise<SettleResult> {
  const { id: principal } = await requirePrincipal();
  const c = await getContainer();
  return done(tripId, await c.membership.reopenTrip(principal, TripId(tripId)));
}

/** "Revisa tu parte": "Todo bien" or a question for the organizer. */
export async function reviewShareAction(tripId: string, status: "ok" | "question", note?: string): Promise<SettleResult> {
  const { id: principal } = await requirePrincipal();
  const c = await getContainer();
  return done(tripId, await c.settlement.reviewMyShare(principal, TripId(tripId), { status: String(status), note: note ? String(note).slice(0, 400) : null }));
}

/** "Compartir resumen": creates (or replaces) the read-only link, or turns it off. */
export async function summaryLinkAction(tripId: string, on: boolean): Promise<SettleResult> {
  const { id: principal } = await requirePrincipal();
  const c = await getContainer();
  if (on) return done(tripId, await c.settlement.createSummaryLink(principal, TripId(tripId)));
  return done(tripId, await c.settlement.revokeSummaryLink(principal, TripId(tripId)));
}
