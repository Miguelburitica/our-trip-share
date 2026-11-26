"use client";

import { useState, useTransition } from "react";
import { closeTripAction, reopenTripAction, startSettlingAction, type SettleResult } from "./actions";

/** A step everyone feels (freezing the plan, closing): one tap to read what happens, one to do it. */
function ConfirmStep(props: {
  trigger: string;
  title: string;
  lines: string[];
  confirm: string;
  busy: string;
  run: () => Promise<SettleResult>;
  tone?: "accent" | "ink";
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const solid = props.tone === "ink" ? "bg-ink text-bg" : "bg-accent text-white";

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`min-h-14 w-full rounded-full text-[17px] font-semibold ${solid}`}>
        {props.trigger}
      </button>
    );
  }
  return (
    <div role="alertdialog" aria-label={props.title} className="flex flex-col gap-3 rounded-3xl bg-surface p-5 shadow-card">
      <p className="text-[17px] font-semibold">{props.title}</p>
      <ul className="flex flex-col gap-1.5">
        {props.lines.map((l) => (
          <li key={l} className="flex gap-2 text-[15px] text-ink-2">
            <span aria-hidden className="text-muted">·</span>
            {l}
          </li>
        ))}
      </ul>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await props.run();
              if (!r.ok) setError(r.message);
            })
          }
          className={`min-h-12 flex-1 rounded-full text-[15px] font-semibold disabled:opacity-60 ${solid}`}
        >
          {pending ? props.busy : props.confirm}
        </button>
        <button type="button" disabled={pending} onClick={() => setOpen(false)} className="min-h-12 flex-1 rounded-full bg-tint text-[15px] font-semibold">
          Cancelar
        </button>
      </div>
      {error && (
        <p role="alert" className="rounded-2xl bg-accent-soft px-4 py-3 text-sm font-medium text-accent-text">
          {error}
        </p>
      )}
    </div>
  );
}

export function StartSettling({ tripId }: { tripId: string }) {
  return (
    <ConfirmStep
      trigger="Empezar a liquidar"
      title="¿Empezar a liquidar?"
      lines={[
        "El plan de pagos queda fijo: nadie ve cambiar a quién le paga.",
        "Cada persona recibe “Revisa tu parte” para confirmar sus gastos.",
        "Aún se pueden agregar o corregir gastos; salen como ajustes.",
      ]}
      confirm="Sí, empezar"
      busy="Congelando el plan…"
      run={() => startSettlingAction(tripId)}
    />
  );
}

export function CloseTrip({ tripId, warnings }: { tripId: string; warnings: string[] }) {
  return (
    <ConfirmStep
      trigger="Cerrar viaje"
      tone="ink"
      title="¿Cerrar el viaje?"
      lines={[...warnings, "Después nadie puede agregar gastos ni pagos. El organizador puede reabrirlo."]}
      confirm={warnings.length ? "Cerrar igual" : "Sí, cerrar"}
      busy="Cerrando…"
      run={() => closeTripAction(tripId)}
    />
  );
}

export function ReopenTrip({ tripId }: { tripId: string }) {
  return (
    <ConfirmStep
      trigger="Reabrir viaje"
      tone="ink"
      title="¿Reabrir el viaje?"
      lines={["Vuelve a Liquidando con el mismo plan.", "Se pueden volver a agregar gastos y pagos."]}
      confirm="Sí, reabrir"
      busy="Reabriendo…"
      run={() => reopenTripAction(tripId)}
    />
  );
}
