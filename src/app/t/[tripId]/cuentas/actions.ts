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
