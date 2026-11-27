"use server";

import { currentPrincipal } from "@/composition/auth";
import { getContainer } from "@/composition/server";

/** "Activar avisos" on this device: stores its Web Push subscription for the signed-in person. */
export async function savePushSubscriptionAction(sub: { endpoint: string; keys?: { p256dh?: string; auth?: string } }): Promise<{ ok: boolean }> {
  const principal = await currentPrincipal();
  if (!principal) return { ok: false };
  try {
    await (await getContainer()).notifications.subscribe(principal.id, {
      endpoint: String(sub.endpoint),
      p256dh: String(sub.keys?.p256dh ?? ""),
      auth: String(sub.keys?.auth ?? ""),
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function removePushSubscriptionAction(endpoint: string): Promise<{ ok: boolean }> {
  if (!(await currentPrincipal())) return { ok: false };
  await (await getContainer()).notifications.unsubscribe(String(endpoint));
  return { ok: true };
}
