"use client";

import { useState, useTransition } from "react";
import { parseAmount } from "@/app/ui/money";
import { setExpenseRateAction } from "../../actions";

/**
 * Foreign-currency expense: put what the card actually charged (it wins over the day's rate), or
 * look the rate up again for a "tasa pendiente".
 */
export function RateEditor(props: { tripId: string; expenseId: string; version: number; baseCurrency: string; pending: boolean; charged: boolean }) {
  const [open, setOpen] = useState(props.pending);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const charge = parseAmount(text, props.baseCurrency);
  const run = (cardCharge: number | null) =>
    startTransition(async () => {
      setError(null);
      const r = await setExpenseRateAction({ tripId: props.tripId, expenseId: props.expenseId, expectedVersion: props.version, cardCharge });
      if (!r.ok) setError(r.message);
      else {
        setText("");
        setOpen(false);
      }
    });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="min-h-11 self-start px-1 text-[15px] font-semibold text-accent-text">
        {props.charged ? "Cambiar lo que cobró la tarjeta" : "Poner lo que cobró la tarjeta"}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      <label htmlFor="card-charge" className="px-1 text-[15px] font-semibold">
        ¿Cuánto cobró la tarjeta en {props.baseCurrency}?
      </label>
      <div className="flex gap-2">
        <input
          id="card-charge"
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ej: 98.400"
          className="h-12 min-w-0 flex-1 rounded-2xl bg-tint px-4 text-[17px] outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent/50"
        />
        <button
          type="button"
          disabled={busy || !charge}
          onClick={() => run(charge)}
          className="h-12 rounded-full bg-ink px-5 text-[15px] font-semibold text-bg disabled:bg-tint-2 disabled:text-muted"
        >
          Guardar
        </button>
      </div>
      <div className="flex gap-4 px-1">
        {props.pending && (
          <button type="button" disabled={busy} onClick={() => run(null)} className="min-h-11 text-[15px] font-semibold text-accent-text">
            {busy ? "Buscando…" : "Buscar la tasa del día"}
          </button>
        )}
        {!props.pending && (
          <button type="button" disabled={busy} onClick={() => setOpen(false)} className="min-h-11 text-[15px] font-semibold text-muted">
            Cancelar
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-accent-text">
          {error}
        </p>
      )}
    </div>
  );
}
