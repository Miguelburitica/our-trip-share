"use client";

import { useState } from "react";

/**
 * "Compartir": fetches the day's card and hands it to the phone's share sheet (WhatsApp, etc.).
 * Where files can't be shared (most desktops), it downloads the image instead.
 */
export function ShareDay({ tripId, day, tripName, className = "" }: { tripId: string; day: string; tripName: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const share = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/t/${tripId}/resumen-del-dia?dia=${day}`);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const name = `${tripName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "viaje"}-${day}.png`;
      const file = new File([blob], name, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: `${tripName}: así vamos` }).catch((e: unknown) => {
          if ((e as { name?: string }).name !== "AbortError") throw e;
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={share} disabled={busy} className={`flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent-text disabled:opacity-60 ${className}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
        <path d="m16 6-4-4-4 4" />
        <path d="M12 2v13" />
      </svg>
      {busy ? "Preparando…" : failed ? "No se pudo, reintenta" : "Compartir"}
    </button>
  );
}
