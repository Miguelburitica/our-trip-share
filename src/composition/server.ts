import "server-only";
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

async function buildMemory(): Promise<MemoryHolder> {
  const container = createMemoryContainer();
  const demoTripId = await seedCartagena(container);
  return { container, demoTripId };
}

export async function getContainer(): Promise<Container> {
  if (backend() === "supabase") {
    // Repositories are stateless apart from per-aggregate versions held in WeakMaps, so one is enough.
    dbContainer ??= createSupabaseContainer(serviceClient());
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
