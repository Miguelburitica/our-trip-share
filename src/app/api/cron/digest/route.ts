import { headers } from "next/headers";
import { getContainer } from "@/composition/server";

/**
 * Evening digest (PRODUCT_SPEC §6.9), run by Vercel Cron at 20:00 Bogotá (vercel.json). Vercel
 * sends CRON_SECRET as a Bearer token; without the secret configured the route refuses to run.
 * Being a daily database read, it also keeps a free Supabase project from pausing for inactivity.
 */
export async function GET() {
  const secret = process.env.CRON_SECRET;
  const auth = (await headers()).get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const sent = await (await getContainer()).notifications.sendDigest();
  return Response.json({ sent });
}
