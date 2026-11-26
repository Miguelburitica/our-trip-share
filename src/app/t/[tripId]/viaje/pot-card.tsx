"use client";

import { useState, useTransition } from "react";
import { removePotAction, savePotAction } from "../actions";

/**
 * La vaca (PRODUCT_SPEC §3.3): "¿Van a hacer vaca?" creates the group kitty and picks who keeps the
 * money. Admins can hand it to someone else, or remove it while nobody has used it.
 */
export function PotCard(props: {
  tripId: string;
  pot: { holderSeatId: string } | null;
  people: Array<{ id: string; name: string }>;
  canManage: boolean;
  mySeatId: string;
}) {
  const [holder, setHolder] = useState(props.pot?.holderSeatId ?? props.people[0]?.id ?? "");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: true } | { ok: false; message: string }>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.message);
      else setEditing(false);
    });
  const holderName = props.people.find((p) => p.id === props.pot?.holderSeatId)?.name ?? "alguien";
  const keeps = props.pot?.holderSeatId === props.mySeatId ? "La guardas tú" : `La guarda ${holderName}`;

  if (!props.pot && !props.canManage) return null;
  return (
    <section aria-label="La vaca" className="flex flex-col gap-2.5">
      <div className="flex flex-col px-1">
        <h2 className="text-[15px] font-semibold">La vaca</h2>
        <p className="text-[13px] text-muted">
          {props.pot
            ? `${keeps}. Se pone plata en Cuentas y puede pagar gastos.`
            : "Un fondo común: cada uno pone, la vaca paga, y al final lo que sobra vuelve a quien puso."}
        </p>
      </div>
      {(!props.pot || editing) && props.canManage ? (
        <div className="flex flex-col gap-2.5 rounded-3xl bg-surface p-4 shadow-card">
          <label htmlFor="pot-holder" className="px-1 text-[15px] font-semibold">
            ¿Quién guarda la plata?
          </label>
          <select
            id="pot-holder"
            value={holder}
            onChange={(e) => setHolder(e.target.value)}
            className="h-12 rounded-2xl bg-tint px-4 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            {props.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || !holder}
              onClick={() => run(() => savePotAction(props.tripId, holder))}
              className="min-h-12 flex-1 rounded-full bg-ink text-[15px] font-semibold text-bg disabled:opacity-60"
            >
              {props.pot ? "Guardar" : "Hacer vaca"}
            </button>
            {props.pot && (
              <button type="button" disabled={pending} onClick={() => setEditing(false)} className="min-h-12 flex-1 rounded-full bg-tint text-[15px] font-semibold">
                Cancelar
              </button>
            )}
          </div>
          {props.pot && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => removePotAction(props.tripId))}
              className="min-h-11 self-center text-[15px] font-semibold text-accent-text"
            >
              Quitar la vaca
            </button>
          )}
        </div>
      ) : (
        props.canManage && (
          <button type="button" onClick={() => setEditing(true)} className="min-h-11 self-start px-1 text-[15px] font-semibold text-accent-text">
            Cambiar quién la guarda
          </button>
        )
      )}
      {error && (
        <p role="alert" className="px-1 text-sm font-medium text-accent-text">
          {error}
        </p>
      )}
    </section>
  );
}
