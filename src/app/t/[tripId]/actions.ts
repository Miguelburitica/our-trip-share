"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CATEGORIES, type Category } from "@/contexts/expense-ledger/domain/expense";
import { requirePrincipal, signOut } from "@/composition/auth";
import { getContainer } from "@/composition/server";
import { ERROR_COPY as COPY } from "@/app/ui/copy";
import { requestOrigin } from "@/app/ui/origin";
import { ExpenseId, NoticeId, SeatId, SplitGroupId, TripId } from "@/shared-kernel/ids";

export type ActionResult =
  | { ok: true; warnings: string[] }
  | { ok: false; message: string };


const WARNING_COPY = {
  personal: "Solo tú: no cambia las cuentas",
  possible_duplicate: "Se parece a otro gasto reciente",
  unusually_large: "Es mucho más alto de lo normal en este viaje",
} as const;

/** Server Action for quick add. Input is untrusted: everything is re-validated by the domain. */
export async function recordExpenseAction(input: {
  tripId: string;
  amount: number;
  /** The expense's currency (default: the trip's). */
  currency?: string;
  /** What the card charged, in the trip's currency; wins over any rate. */
  cardCharge?: number | null;
  category: string;
  title?: string;
  payerSeatId: string;
  participantIds: string[];
  receiptPath?: string | null;
}): Promise<ActionResult> {
  const { id: principal } = await requirePrincipal();
  const c = await getContainer();
  const category = (CATEGORIES as readonly string[]).includes(input.category) ? (input.category as Category) : "otro";
  const trip = await c.membership.getTrip(principal, TripId(input.tripId));
  if (!trip.ok) return { ok: false, message: COPY[trip.error.code] };

  const currency = input.currency ? String(input.currency) : trip.value.baseCurrency;
  const fx =
    currency === trip.value.baseCurrency
      ? undefined
      : input.cardCharge != null
        ? { kind: "card_charge" as const, baseAmount: Number(input.cardCharge) }
        : // The ledger asks the rate provider itself (cached per day, so it matches the preview).
          undefined;
  const result = await c.ledger.recordExpense(principal, TripId(input.tripId), {
    currency,
    fx,
    amount: Number(input.amount),
    category,
    title: input.title?.slice(0, 80) || null,
    payers: [{ seatId: SeatId(String(input.payerSeatId)) }],
    split: { method: "equal", participants: (input.participantIds ?? []).map((id) => SeatId(String(id))) },
    receiptPaths: input.receiptPath ? [String(input.receiptPath)] : [],
  });
  if (!result.ok) return { ok: false, message: result.error.message || COPY[result.error.code] };
  revalidatePath(`/t/${input.tripId}`, "layout");
  return { ok: true, warnings: result.value.warnings.map((w) => WARNING_COPY[w.code]) };
}

/**
 * "Editar reparto": a new total and who owes what. Equal splits are sent as equal (so later total
 * changes keep rebalancing); anything adjusted by hand is sent as exact amounts. The version guards
 * against two people editing at once.
 */
export async function editSplitAction(input: {
  tripId: string;
  expenseId: string;
  expectedVersion: number;
  amount: number;
  split: { method: "equal"; participants: string[] } | { method: "exact"; shares: Array<{ seatId: string; amount: number }> };
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { id: principal } = await requirePrincipal();
  const c = await getContainer();
  const tripId = TripId(input.tripId);
  const current = await c.ledger.getExpense(principal, tripId, ExpenseId(String(input.expenseId)));
  if (!current.ok) return { ok: false, message: current.error.message || COPY[current.error.code] };
  if (!current.value.currency) return { ok: false, message: "Este gasto aún no tiene monto" };
  // A foreign-currency expense keeps its frozen rate (the ledger handles it).
  const split =
    input.split?.method === "exact"
      ? {
          method: "exact" as const,
          shares: (input.split.shares ?? []).map((s) => ({ seatId: SeatId(String(s.seatId)), amount: Number(s.amount) })),
        }
      : { method: "equal" as const, participants: (input.split?.participants ?? []).map((id) => SeatId(String(id))) };
  const r = await c.ledger.editExpenseMoney(principal, tripId, ExpenseId(String(input.expenseId)), Number(input.expectedVersion), {
    currency: current.value.currency,
    amount: Number(input.amount),
    split,
  });
  if (!r.ok) {
    if (r.error.code === "conflict") return { ok: false, message: "Alguien editó este gasto mientras tanto. Recarga para ver lo último." };
    return { ok: false, message: r.error.message || COPY[r.error.code] };
  }
  revalidatePath(`/t/${input.tripId}`, "layout");
  return { ok: true };
}

/** "Borrar gasto": soft delete (it leaves everyone's balances, history keeps it), then back to Gastos. */
export async function deleteExpenseAction(tripId: string, expenseId: string): Promise<{ ok: false; message: string }> {
  const { id: principal } = await requirePrincipal();
  const c = await getContainer();
  const r = await c.ledger.deleteExpense(principal, TripId(tripId), ExpenseId(String(expenseId)));
  if (!r.ok) return { ok: false, message: r.error.message || COPY[r.error.code] };
  revalidatePath(`/t/${tripId}`, "layout");
  redirect(`/t/${tripId}/gastos?borrado=1`);
}

/** Quick add's "≈" preview for a foreign currency. */
export async function quoteRateAction(tripId: string, currency: string): Promise<{ ok: true; rate: string | null } | { ok: false }> {
  const { id: principal } = await requirePrincipal();
  const c = await getContainer();
  const r = await c.ledger.quoteRate(principal, TripId(tripId), String(currency));
  return r.ok ? { ok: true, rate: r.value.rate } : { ok: false };
}

export type ScanResult =
  | {
      ok: true;
      receiptPath: string;
      read: boolean;
      amount: number | null;
      currency: string | null;
      title: string | null;
      category: string | null;
      note: string | null;
    }
  | { ok: false; message: string };

/** "Foto de la factura": uploads the (already downscaled) photo and reads it to pre-fill quick add. */
export async function scanReceiptAction(formData: FormData): Promise<ScanResult> {
  const { id: principal } = await requirePrincipal();
  const tripId = String(formData.get("tripId") ?? "");
  const photo = formData.get("photo");
  if (!(photo instanceof File)) return { ok: false, message: "Elige una foto" };
  const c = await getContainer();
  const r = await c.ledger.scanReceipt(principal, TripId(tripId), {
    bytes: new Uint8Array(await photo.arrayBuffer()),
    mediaType: photo.type as "image/jpeg",
  });
  if (!r.ok) return { ok: false, message: r.error.message || COPY[r.error.code] };
  const { receiptPath, read, amount, currency, title, category, note } = r.value;
  return { ok: true, receiptPath, read, amount, currency, title, category, note };
}

export type GroupResult = { ok: true; group: { id: string; name: string; seatIds: string[]; canDelete: boolean } } | { ok: false; message: string };

/** Saves the current selection in quick add as a named group for the whole trip. */
export async function saveSplitGroupAction(tripId: string, name: string, seatIds: string[]): Promise<GroupResult> {
  const { id: principal } = await requirePrincipal();
  const c = await getContainer();
  const r = await c.ledger.saveSplitGroup(principal, TripId(tripId), {
    name: String(name).slice(0, 60),
    seatIds: (seatIds ?? []).map((id) => SeatId(String(id))),
  });
  if (!r.ok) return { ok: false, message: r.error.message || COPY[r.error.code] };
  revalidatePath(`/t/${tripId}/nuevo`);
  return { ok: true, group: r.value };
}

export async function deleteSplitGroupAction(tripId: string, groupId: string): Promise<{ ok: boolean; message?: string }> {
  const { id: principal } = await requirePrincipal();
  const c = await getContainer();
  const r = await c.ledger.deleteSplitGroup(principal, TripId(tripId), SplitGroupId(String(groupId)));
  if (!r.ok) return { ok: false, message: r.error.message || COPY[r.error.code] };
  revalidatePath(`/t/${tripId}/nuevo`);
  return { ok: true };
}

export type InviteResult = { ok: true; url: string; message: string } | { ok: false; message: string };

/** "Invitar": a fresh personal link for one seat. Issuing again revokes the previous link. */
export async function issueInviteAction(tripId: string, seatId: string, recover = false): Promise<InviteResult> {
  const { id: principal } = await requirePrincipal();
  const c = await getContainer();
  const trip = await c.membership.getTrip(principal, TripId(tripId));
  if (!trip.ok) return { ok: false, message: COPY[trip.error.code] };
  const seat = trip.value.seats.find((s) => s.id === seatId);
  const result = await c.membership.issueInvite(principal, TripId(tripId), SeatId(String(seatId)));
  if (!result.ok || !seat) return { ok: false, message: result.ok ? COPY.not_found : result.error.message };

  const origin = await requestOrigin();
  const url = `${origin}/s/${tripId}/${encodeURIComponent(result.value.token)}`;
  const first = seat.displayName.split(" ")[0];
  return {
    ok: true,
    url,
    message: recover
      ? `${first}, aquí está tu nuevo enlace para *${trip.value.name}* en Our Share. Al abrirlo, tu lugar pasa a ese teléfono: ${url}`
      : `${first}, te agregué a *${trip.value.name}* en Our Share. Aquí ves cuánto te toca: ${url}`,
  };
}

/** "Entendido" on a "Tu saldo cambió" card. */
export async function dismissNoticeAction(tripId: string, noticeId: string): Promise<void> {
  const { id: principal } = await requirePrincipal();
  const c = await getContainer();
  await c.settlement.dismissNotice(principal, TripId(tripId), NoticeId(String(noticeId)));
  revalidatePath(`/t/${tripId}`);
}

/** Creates or rotates the trip's generic link (QR). */
export async function issueJoinLinkAction(tripId: string): Promise<{ ok: boolean; message?: string }> {
  const { id: principal } = await requirePrincipal();
  const c = await getContainer();
  const r = await c.membership.issueJoinLink(principal, TripId(tripId));
  if (!r.ok) return { ok: false, message: r.error.message || COPY[r.error.code] };
  revalidatePath(`/t/${tripId}`, "layout");
  return { ok: true };
}

/** Approve or reject someone who asked to join through the generic link. */
export async function decideClaimAction(tripId: string, seatId: string, approve: boolean): Promise<{ ok: boolean; message?: string }> {
  const { id: principal } = await requirePrincipal();
  const c = await getContainer();
  const r = approve
    ? await c.membership.approveClaim(principal, TripId(tripId), SeatId(String(seatId)))
    : await c.membership.rejectClaim(principal, TripId(tripId), SeatId(String(seatId)));
  if (!r.ok) return { ok: false, message: r.error.message || COPY[r.error.code] };
  revalidatePath(`/t/${tripId}`, "layout");
  return { ok: true };
}

/** "Cómo te pagan": my payment details for this trip. */
export async function saveHandlesAction(
  tripId: string,
  handles: Array<{ kind: string; value: string }>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { id: principal } = await requirePrincipal();
  const c = await getContainer();
  const r = await c.settlement.setMyHandles(
    principal,
    TripId(tripId),
    (handles ?? []).slice(0, 10).map((h) => ({ kind: String(h.kind), value: String(h.value).slice(0, 200) })),
  );
  if (!r.ok) return { ok: false, message: r.error.message || COPY[r.error.code] };
  revalidatePath(`/t/${tripId}`, "layout");
  return { ok: true };
}

export async function signOutAction() {
  await signOut();
  redirect("/");
}

/**
 * Gasto en otra moneda: "La tarjeta cobró $X" (cardCharge) or, without it, the day's rate again
 * (to settle a "tasa pendiente").
 */
export async function setExpenseRateAction(input: {
  tripId: string;
  expenseId: string;
  expectedVersion: number;
  cardCharge: number | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { id: principal } = await requirePrincipal();
  const c = await getContainer();
  const r = await c.ledger.setExpenseRate(principal, TripId(input.tripId), ExpenseId(String(input.expenseId)), Number(input.expectedVersion), {
    cardCharge: input.cardCharge == null ? null : Number(input.cardCharge),
  });
  if (!r.ok) {
    if (r.error.code === "conflict") return { ok: false, message: "Alguien editó este gasto mientras tanto. Recarga para ver lo último." };
    return { ok: false, message: r.error.message || COPY[r.error.code] };
  }
  revalidatePath(`/t/${input.tripId}`, "layout");
  return { ok: true };
}
