"use client";

import { useState, useTransition } from "react";
import { decideHeldChangeAction } from "./actions";

export interface HeldItem {
  id: string;
  /** "Juli agregó Taxi · $40.000" */
  line: string;
  when: string;
  mine: boolean;
}

/**
 * R14 while Liquidando: changes that would reopen someone's settled balance wait here. Admins
 * approve or turn them down; whoever made one can withdraw it.
 */
export function HeldChanges(props: { tripId: string; items: HeldItem[]; canDecide: boolean; title?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const decide = (id: string, approve: boolean) =>
    startTransition(async () => {
      setError(null);
      setBusy(id);
      const r = await decideHeldChangeAction(props.tripId, id, approve);
      setBusy(null);
      if (!r.ok) setError(r.message);
    });

  if (props.items.length === 0) return null;
  return (
    <section aria-label="Cambios por aprobar" className="flex flex-col gap-2.5">
      <div className="flex flex-col px-1">
        <h2 className="text-[15px] font-semibold">{props.title ?? "Cambios por aprobar"}</h2>
        <p className="text-[13px] text-muted">
          {props.items.length === 1
            ? "Cambia el saldo de alguien que ya pagó, así que no cuenta hasta que un admin lo apruebe."
            : "Cambian el saldo de alguien que ya pagó, así que no cuentan hasta que un admin los apruebe."}
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {props.items.map((h) => (
          <li key={h.id} className="flex flex-col gap-2.5 rounded-[22px] bg-accent-soft px-4.5 py-4">
            <span className="flex flex-col">
              <span className="text-[15px] font-semibold text-accent-text">{h.line}</span>
              <span className="text-[13px] text-accent-text/80">{h.when}</span>
            </span>
            <span className="flex gap-2">
              {props.canDecide && (
                <button
                  type="button"
                  disabled={busy === h.id}
                  onClick={() => decide(h.id, true)}
                  className="min-h-11 flex-1 rounded-full bg-accent text-sm font-semibold text-white disabled:opacity-60"
                >
                  Aprobar
                </button>
              )}
              {(props.canDecide || h.mine) && (
                <button
                  type="button"
                  disabled={busy === h.id}
                  onClick={() => decide(h.id, false)}
                  className="min-h-11 flex-1 rounded-full bg-surface text-sm font-semibold disabled:opacity-60"
                >
                  {props.canDecide ? "Rechazar" : "Retirar"}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="px-1 text-sm font-medium text-accent-text">
          {error}
        </p>
      )}
    </section>
  );
}
