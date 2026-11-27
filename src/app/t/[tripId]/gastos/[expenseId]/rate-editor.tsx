"use client";

import { useState, useTransition } from "react";
import { parseAmount, parseRate, rateShort } from "@/app/ui/money";
import { setExpenseRateAction } from "../../actions";

type Mode = "card" | "rate";

/**
 * Foreign-currency expense: what the card actually charged, or a rate typed by hand (cash changed
 * at a casa de cambio). Both win over the day's rate. A "tasa pendiente" can also look it up again.
 */
export function RateEditor(props: {
  tripId: string;
  expenseId: string;
  version: number;
  currency: string;
  baseCurrency: string;
  pending: boolean;
  source: string | null;
  rate: string | null;
}) {
  const [open, setOpen] = useState(props.pending);
  const [mode, setMode] = useState<Mode>(props.source === "manual" ? "rate" : "card");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const charge = mode === "card" ? parseAmount(text, props.baseCurrency) : null;
  const typed = mode === "rate" ? parseRate(text) : null;
  const ready = mode === "card" ? !!charge : typed !== null;
  // The day's rate (from the provider) is the reference; a manual one far from it is likely a typo.
  const reference = props.source === "api" ? props.rate : null;
  const far = typed !== null && reference !== null && Math.abs(Number(typed) / Number(reference) - 1) > 0.25;

  const run = (input: { cardCharge: number | null; rate?: string | null }) =>
    startTransition(async () => {
      setError(null);
      const r = await setExpenseRateAction({ tripId: props.tripId, expenseId: props.expenseId, expectedVersion: props.version, ...input });
      if (!r.ok) setError(r.message);
      else {
        setText("");
        setOpen(false);
      }
    });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="min-h-11 self-start px-1 text-[15px] font-semibold text-accent-text">
        Ajustar la tasa
      </button>
    );
  }
  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      aria-pressed={mode === m}
      onClick={() => {
        setMode(m);
        setText("");
      }}
      className={`min-h-[38px] flex-1 rounded-full px-3 text-[13px] font-semibold ${mode === m ? "bg-ink text-bg" : "bg-tint"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-2.5">
      <div role="group" aria-label="Cómo ajustar la tasa" className="flex gap-2">
        {tab("card", "Lo que cobró la tarjeta")}
        {tab("rate", "Tasa a mano")}
      </div>
      <label htmlFor="fx-input" className="px-1 text-[15px] font-semibold">
        {mode === "card" ? `¿Cuánto cobró la tarjeta en ${props.baseCurrency}?` : `1 ${props.currency} = ¿cuántos ${props.baseCurrency}?`}
      </label>
      <div className="flex gap-2">
        <input
          id="fx-input"
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={mode === "card" ? "Ej: 98.400" : props.rate ? `Ej: ${rateShort(props.rate)}` : "Ej: 3.900"}
          className="h-12 min-w-0 flex-1 rounded-2xl bg-tint px-4 text-[17px] outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent/50"
        />
        <button
          type="button"
          disabled={busy || !ready}
          onClick={() => run(mode === "card" ? { cardCharge: charge } : { cardCharge: null, rate: typed })}
          className="h-12 rounded-full bg-ink px-5 text-[15px] font-semibold text-bg disabled:bg-tint-2 disabled:text-muted"
        >
          Guardar
        </button>
      </div>
      {mode === "rate" && (
        <p className="px-1 text-[13px] text-muted">
          {far ? `Muy distinta a la del día (${rateShort(reference!)}). Revisa que esté bien.` : "Para efectivo cambiado en una casa de cambio."}
        </p>
      )}
      <div className="flex gap-4 px-1">
        {props.pending && (
          <button type="button" disabled={busy} onClick={() => run({ cardCharge: null })} className="min-h-11 text-[15px] font-semibold text-accent-text">
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
