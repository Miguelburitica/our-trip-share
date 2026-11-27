"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
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
  const name = "newName" in choice ? String(choice.newName).slice(0, 40) : null;
  after(async () => {
    // The chosen seat's name, or the new one they typed.
    let seatName = name;
    if (!seatName && "seatId" in choice) {
      const info = await c.membership.publicTripInfo(TripId(tripId));
      seatName = info.ok ? (info.value.names[String(choice.seatId)] ?? null) : null;
    }
    await c.notifications.joinRequested(TripId(tripId), seatName ?? "Alguien");
  });
  revalidatePath(`/u/${tripId}/${token}`);
  return null;
}
