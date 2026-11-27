"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { syncPending, warmTrip } from "./client";

/**
 * Mounted on every trip screen. Registers the service worker (production builds only: in dev it
 * would fight hot reload), keeps the trip's screens cached for offline use, and sends expenses
 * saved offline whenever the signal comes back.
 */
export function OfflineSync() {
  const { tripId } = useParams<{ tripId: string }>();
  const router = useRouter();

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then(() => navigator.serviceWorker.ready)
        .then(() => (tripId ? warmTrip(tripId) : undefined))
        .catch(() => {});
    }
  }, [tripId]);

  useEffect(() => {
    let live = true;
    const sync = async () => {
      const report = await syncPending().catch(() => null);
      if (live && report && report.sent > 0) router.refresh();
    };
    const onVisible = () => document.visibilityState === "visible" && sync();
    sync();
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
