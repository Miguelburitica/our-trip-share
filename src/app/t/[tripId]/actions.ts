"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CATEGORIES, type Category } from "@/contexts/expense-ledger/domain/expense";
import { requirePrincipal, signOut } from "@/composition/auth";
import { getContainer } from "@/composition/server";
import { ERROR_COPY as COPY } from "@/app/ui/copy";
import { NoticeId, SeatId, SplitGroupId, TripId } from "@/shared-kernel/ids";

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
  category: string;
  title?: string;
  payerSeatId: string;
  participantIds: string[];
}): Promise<ActionResult> {
  const { id: principal } = await requirePrincipal();
  const c = await getContainer();
  const category = (CATEGORIES as readonly string[]).includes(input.category) ? (input.category as Category) : "otro";
  const trip = await c.membership.getTrip(principal, TripId(input.tripId));
  if (!trip.ok) return { ok: false, message: COPY[trip.error.code] };

  const result = await c.ledger.recordExpense(principal, TripId(input.tripId), {
    currency: trip.value.baseCurrency,
    amount: Number(input.amount),
    category,
    title: input.title?.slice(0, 80) || null,
    payers: [{ seatId: SeatId(String(input.payerSeatId)) }],
    split: { method: "equal", participants: (input.participantIds ?? []).map((id) => SeatId(String(id))) },
  });
  if (!result.ok) return { ok: false, message: result.error.message || COPY[result.error.code] };
  revalidatePath(`/t/${input.tripId}`, "layout");
  return { ok: true, warnings: result.value.warnings.map((w) => WARNING_COPY[w.code]) };
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
export async function issueInviteAction(tripId: string, seatId: string): Promise<InviteResult> {
  const { id: principal } = await requirePrincipal();
  const c = await getContainer();
  const trip = await c.membership.getTrip(principal, TripId(tripId));
  if (!trip.ok) return { ok: false, message: COPY[trip.error.code] };
  const seat = trip.value.seats.find((s) => s.id === seatId);
  const result = await c.membership.issueInvite(principal, TripId(tripId), SeatId(String(seatId)));
  if (!result.ok || !seat) return { ok: false, message: result.ok ? COPY.not_found : result.error.message };

  const h = await headers();
  const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const url = `${origin}/s/${tripId}/${encodeURIComponent(result.value.token)}`;
  const first = seat.displayName.split(" ")[0];
  return {
    ok: true,
    url,
    message: `${first}, te agregué a *${trip.value.name}* en Our Share. Aquí ves cuánto te toca: ${url}`,
  };
}

/** "Entendido" on a "Tu saldo cambió" card. */
export async function dismissNoticeAction(tripId: string, noticeId: string): Promise<void> {
  const { id: principal } = await requirePrincipal();
  const c = await getContainer();
  await c.settlement.dismissNotice(principal, TripId(tripId), NoticeId(String(noticeId)));
  revalidatePath(`/t/${tripId}`);
}

export async function signOutAction() {
  await signOut();
  redirect("/");
}
