"use server";

import { redirect } from "next/navigation";
import { ensurePrincipal } from "@/composition/auth";
import { getContainer } from "@/composition/server";
import { ERROR_COPY } from "@/app/ui/copy";

export type CreateTripState = { message: string } | null;

/** "¿Quiénes van?" accepts commas or new lines. */
const parsePeople = (raw: string) =>
  raw
    .split(/[,\n]/)
    .map((n) => n.trim())
    .filter(Boolean);

/** No wall: creating a trip without a session makes you a guest on this device (spec 6.1). */
export async function createTripAction(_prev: CreateTripState, form: FormData): Promise<CreateTripState> {
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const principal = await ensurePrincipal();
  const c = await getContainer();
  const result = await c.membership.createTrip({
    principal,
    name: text("name"),
    displayName: text("displayName"),
    baseCurrency: text("currency") || "COP",
    startDate: text("startDate") || null,
    endDate: text("endDate") || null,
    people: parsePeople(text("people")),
  });
  if (!result.ok) return { message: result.error.message || ERROR_COPY[result.error.code] };
  redirect(`/t/${result.value.id}/viaje?nuevo=1`);
}
