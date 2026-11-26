import "server-only";
import { headers } from "next/headers";

/** The origin people opened the app from, for links we hand out (WhatsApp, QR). */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  return h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}
