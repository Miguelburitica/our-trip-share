"use server";

import { revalidatePath } from "next/cache";
import { ensurePrincipal } from "@/composition/auth";
import { getContainer } from "@/composition/server";
import { SeatId, TripId } from "@/shared-kernel/ids";
import { ERROR_COPY } from "@/app/ui/copy";

/** Generic link: a guest session on this device if needed, then a pending request an admin approves. */
export async function requestJoinAction(
  tripId: string,
  token: string,
  choice: { seatId: string } | { newName: string },
): Promise<{ message: string } | null> {
  const principal = await ensurePrincipal();
  const c = await getContainer();
  const r = await c.membership.requestJoin(
    TripId(tripId),
    String(token),
    principal,
    "seatId" in choice ? { seatId: SeatId(String(choice.seatId)) } : { newName: String(choice.newName).slice(0, 40) },
  );
  if (!r.ok) return { message: r.error.message || ERROR_COPY[r.error.code] };
  revalidatePath(`/u/${tripId}/${token}`);
  return null;
}
