"use server";

import { redirect } from "next/navigation";
import { ensurePrincipal } from "@/composition/auth";
import { getContainer } from "@/composition/server";
import { TripId } from "@/shared-kernel/ids";
import { ERROR_COPY } from "@/app/ui/copy";

export type JoinState = { message: string } | null;

/** "Entrar como Juli": a guest session on this device if needed, then the compare-and-set claim. */
export async function joinWithInviteAction(tripId: string, token: string): Promise<JoinState> {
  const principal = await ensurePrincipal();
  const c = await getContainer();
  const result = await c.membership.claimWithInvite(TripId(tripId), token, principal);
  if (!result.ok) return { message: result.error.message || ERROR_COPY[result.error.code] };
  redirect(`/t/${result.value.id}`);
}
