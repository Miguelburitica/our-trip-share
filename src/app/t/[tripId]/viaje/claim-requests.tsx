"use client";

import { useState, useTransition } from "react";
import { decideClaimAction } from "../actions";

/** People who asked to join through the generic link, waiting for an admin (or the seat's creator). */
export function ClaimRequests(props: { tripId: string; requests: Array<{ seatId: string; name: string; isNew: boolean; since: string }> }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const decide = (seatId: string, approve: boolean) => {
    setBusy(seatId);
    startTransition(async () => {
      const r = await decideClaimAction(props.tripId, seatId, approve);
      if (!r.ok) setError(r.message ?? "No se pudo");
      setBusy(null);
    });
  };
  return (
    <section aria-label="Solicitudes" className="flex flex-col gap-2.5">
      <h2 className="px-1 text-[15px] font-semibold">Quieren entrar · {props.requests.length}</h2>
      <ul className="flex flex-col gap-2">
        {props.requests.map((r) => (
          <li key={r.seatId} className="flex flex-col gap-3 rounded-[22px] bg-accent-soft px-4.5 py-4">
            <span className="flex flex-col">
              <span className="text-[15px] font-semibold text-accent-text">
                {r.isNew ? `${r.name} pide entrar (no estaba en la lista)` : `Alguien pide entrar como ${r.name}`}
              </span>
              <span className="text-[13px] text-accent-text/80">Apruébalo solo si sabes que es esa persona · {r.since}</span>
            </span>
            <span className="flex gap-2">
              <button type="button" disabled={busy !== null} onClick={() => decide(r.seatId, true)} className="min-h-11 flex-1 rounded-full bg-accent text-sm font-semibold text-white disabled:opacity-60">
                {busy === r.seatId ? "…" : "Aprobar"}
              </button>
              <button type="button" disabled={busy !== null} onClick={() => decide(r.seatId, false)} className="min-h-11 flex-1 rounded-full bg-surface text-sm font-semibold disabled:opacity-60">
                Rechazar
              </button>
            </span>
          </li>
        ))}
      </ul>
      {error && <p className="px-1 text-sm text-accent-text">{error}</p>}
    </section>
  );
}
