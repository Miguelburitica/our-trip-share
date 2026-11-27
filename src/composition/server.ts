import "server-only";
import { CurrencyApiRateProvider } from "@/contexts/expense-ledger/infrastructure/currency-api-rate-provider";
import { after } from "next/server";
import { WebPushSender } from "@/contexts/notifications/infrastructure/web-push-sender";
import { SharpReceiptCompressor } from "@/contexts/expense-ledger/infrastructure/sharp-receipt-compressor";
import { OpenRouterReceiptReader } from "@/contexts/expense-ledger/infrastructure/openrouter-receipt-reader";
import { createSupabaseContainer, createMemoryContainer, type Container } from "./container";
import { seedCartagena } from "./demo-seed";
import { serviceClient } from "@/platform/supabase/clients";
import type { TripId } from "@/shared-kernel/ids";

/**
 * Server-side access to the composition root.
 * DATA_BACKEND=supabase: repositories in Postgres, real sign-in (see .env.example).
 * Otherwise: a seeded in-process demo that survives hot reloads via globalThis.
 */
export type Backend = "memory" | "supabase";
export const backend = (): Backend => (process.env.DATA_BACKEND === "supabase" ? "supabase" : "memory");

type MemoryHolder = { container: Container; demoTripId: TripId };
const g = globalThis as unknown as { __ourShare?: Promise<MemoryHolder> };
// Module scope, not globalThis: it holds no data, so a hot reload should rebuild it with new code.
let dbContainer: Container | undefined;

/** Receipt reading is on when the server has an OpenRouter key (see .env.example). */
const reader = () => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  return apiKey ? new OpenRouterReceiptReader({ apiKey, model: process.env.OPENROUTER_RECEIPT_MODEL }) : null;
};

/** Stored receipt photos are shrunk to small WebP copies. */
const compressor = new SharpReceiptCompressor();

/** Web Push when VAPID keys are set; otherwise notifications are off and nothing else changes. */
const push = (() => {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  return publicKey && privateKey ? new WebPushSender({ publicKey, privateKey, subject: "https://our-trip-share.vercel.app" }) : null;
})();

/** Notifications go out after the response, so they never slow down a save. */
const defer = (task: () => Promise<unknown>) => after(task);

/** Daily FX rates; one instance so its per-day cache is shared. */
const rates = new CurrencyApiRateProvider();

async function buildMemory(): Promise<MemoryHolder> {
  const container = createMemoryContainer({ reader: reader(), rates, compressor, push, defer });
  const demoTripId = await seedCartagena(container);
  return { container, demoTripId };
}

export async function getContainer(): Promise<Container> {
  if (backend() === "supabase") {
    // Repositories are stateless apart from per-aggregate versions held in WeakMaps, so one is enough.
    dbContainer ??= createSupabaseContainer(serviceClient(), { reader: reader(), rates, compressor, push, defer });
    return dbContainer;
  }
  g.__ourShare ??= buildMemory();
  return (await g.__ourShare).container;
}

/** Memory backend only: the seeded Cartagena trip. */
export async function getDemoTripId(): Promise<TripId> {
  g.__ourShare ??= buildMemory();
  return (await g.__ourShare).demoTripId;
}
