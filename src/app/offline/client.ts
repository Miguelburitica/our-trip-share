"use client";

import { recordExpenseAction, uploadReceiptAction } from "@/app/t/[tripId]/actions";
import { pendingStore } from "./pending-store";
import { flushPending, type PendingExpense, type SyncApi, type SyncReport } from "./sync";

/** Must match public/sw.js. */
export const PAGES_CACHE = "pages-v1";
export const ASSETS_CACHE = "assets-v1";

const api: SyncApi = {
  async upload(tripId, photo) {
    const form = new FormData();
    form.set("tripId", tripId);
    form.set("photo", new File([photo], "factura.jpg", { type: photo.type || "image/jpeg" }));
    return uploadReceiptAction(form);
  },
  async record(item) {
    return recordExpenseAction({
      tripId: item.tripId,
      ...item.input,
      receiptPath: item.receiptPath ?? null,
      clientId: item.id,
      occurredAt: item.createdAt,
    });
  },
};

/** Sends what's waiting. One sync at a time across tabs; ids make any overlap harmless anyway. */
export async function syncPending(): Promise<SyncReport | null> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;
  const go = () => flushPending(pendingStore, api);
  if (navigator.locks) return navigator.locks.request("our-share-sync", { ifAvailable: true }, (lock) => (lock ? go() : null));
  return go();
}

export function queueExpense(item: Omit<PendingExpense, "status" | "createdAt"> & { createdAt?: string }) {
  return pendingStore.put({ ...item, createdAt: item.createdAt ?? new Date().toISOString(), status: "waiting" });
}

/** A Server Action that doesn't answer in time counts as offline (the queue retries it safely). */
export function withTimeout<T>(p: Promise<T>, ms = 12_000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

/**
 * Keeps a trip usable without signal: caches its main screens and the files they need, so the app
 * opens and quick add works offline. At most once an hour per trip.
 */
export async function warmTrip(tripId: string) {
  if (!("caches" in window) || !navigator.onLine) return;
  const key = `our-share:warm:${tripId}`;
  try {
    if (Number(localStorage.getItem(key) ?? 0) > Date.now() - 3_600_000) return;
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // No storage: warm anyway.
  }
  const pages = await caches.open(PAGES_CACHE);
  const assets = await caches.open(ASSETS_CACHE);
  for (const path of [`/t/${tripId}`, `/t/${tripId}/nuevo`, `/t/${tripId}/gastos`]) {
    try {
      const res = await fetch(path, { credentials: "same-origin" });
      if (!res.ok || res.redirected) continue;
      const html = await res.clone().text();
      await pages.put(path, res);
      const files = [...new Set(html.match(/\/_next\/static\/[^"'\s\\)]+/g) ?? [])];
      for (const file of files) if (!(await assets.match(file))) await assets.add(file).catch(() => {});
    } catch {
      return; // Connection dropped: try next time.
    }
  }
}

/** Signing out on a shared phone: nothing of this person stays behind. */
export async function forgetEverything() {
  await pendingStore.clear().catch(() => {});
  if ("caches" in window) for (const name of await caches.keys()) await caches.delete(name);
}
