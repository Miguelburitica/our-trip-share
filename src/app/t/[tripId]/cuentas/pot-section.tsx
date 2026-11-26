"use client";

import { useState, useTransition } from "react";
import { fmt, parseAmount } from "@/app/ui/money";
import { recordSettlementAction } from "./actions";

const METHODS = [
  ["cash", "Efectivo"],
  ["nequi", "Nequi"],
  ["breb", "Bre-B"],
  ["daviplata", "Daviplata"],
  ["bank", "Banco"],
] as const;

/**
 * La vaca in Cuentas: what it holds, who put what, and "Poner plata". A contribution is a payment
 * to the pot: pending until its holder confirms it, or confirmed at once when the holder records it.
 */
export function PotSection(props: {
  tripId: string;
  currency: string;
  pot: { seatId: string; holderSeatId: string; cash: number; contributions: Array<{ seatId: string; amount: number }> };
  mySeatId: string;
  names: Record<string, string>;
  people: Array<{ id: string; name: string }>;
  readOnly: boolean;
}) {
  const iHold = props.pot.holderSeatId === props.mySeatId;
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(props.mySeatId);
  const [text, setText] = useState("");
  const [method, setMethod] = useState<string>("cash");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const amount = parseAmount(text, props.currency);
  const name = (id: string) => (id === props.mySeatId ? "Tú" : (props.names[id] ?? "Alguien"));
  const holder = props.pot.holderSeatId === props.mySeatId ? "ti" : (props.names[props.pot.holderSeatId] ?? "alguien");

  const save = () =>
    startTransition(async () => {
      const r = await recordSettlementAction({ tripId: props.tripId, from, to: props.pot.seatId, amount: amount!, method });
      if (!r.ok) setNote({ ok: false, text: r.message });
      else {
        setOpen(false);
        setText("");
        setNote({ ok: true, text: iHold ? "Aporte registrado" : `Listo. Falta que ${props.names[props.pot.holderSeatId]} confirme que le llegó.` });
      }
    });

  return (
    <section aria-label="La vaca" className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-3 rounded-[28px] bg-tint px-5 py-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-semibold">La vaca</span>
          <span className="text-[13px] text-muted">{iHold ? "La guardas tú" : `La guarda ${holder}`}</span>
        </div>
        <span className={`tabular text-[34px] leading-none font-bold tracking-tight ${props.pot.cash < 0 ? "text-accent-text" : ""}`}>
          {fmt(props.pot.cash, props.currency)}
        </span>
        {props.pot.cash < 0 && (
          <span className="-mt-1 text-[13px] text-accent-text">
            Pagó más de lo que tenía: {iHold ? "la diferencia la pusiste tú" : `la diferencia la puso ${holder}`}.
          </span>
        )}
        {props.pot.contributions.length > 0 ? (
          <ul className="flex flex-col gap-1 text-[14px]">
            {props.pot.contributions.map((c) => (
              <li key={c.seatId} className="flex justify-between">
                <span className="text-ink-2">{name(c.seatId)} puso</span>
                <span className="tabular font-semibold">{fmt(c.amount, props.currency)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-[13px] text-muted">Nadie ha puesto plata todavía.</span>
        )}
        {!props.readOnly && !open && (
          <button type="button" onClick={() => setOpen(true)} className="flex min-h-12 items-center justify-center rounded-full bg-ink text-[15px] font-semibold text-bg">
            Poner plata
          </button>
        )}
        {open && (
          <div className="flex flex-col gap-2.5 rounded-3xl bg-surface p-4">
            {iHold && (
              <label className="flex flex-col gap-1.5 text-[15px] font-semibold">
                ¿Quién puso?
                <select
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-12 rounded-2xl bg-tint px-4 text-[16px] font-normal outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  {props.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id === props.mySeatId ? "Yo" : p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1.5 text-[15px] font-semibold">
              ¿Cuánto?
              <input
                inputMode="numeric"
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Ej: 100.000"
                className="h-12 rounded-2xl bg-tint px-4 text-[17px] font-normal outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent/50"
              />
            </label>
            <div role="group" aria-label="Cómo" className="flex flex-wrap gap-1.5">
              {METHODS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={method === id}
                  onClick={() => setMethod(id)}
                  className={`min-h-10 rounded-full px-3.5 text-[13px] font-semibold ${method === id ? "bg-ink text-bg" : "bg-tint"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending || !amount}
                onClick={save}
                className="min-h-12 flex-1 rounded-full bg-accent text-[15px] font-semibold text-white disabled:bg-tint-2 disabled:text-muted"
              >
                {pending ? "Guardando…" : "Listo"}
              </button>
              <button type="button" disabled={pending} onClick={() => setOpen(false)} className="min-h-12 flex-1 rounded-full bg-tint text-[15px] font-semibold">
                Cancelar
              </button>
            </div>
          </div>
        )}
        {note && (
          <p role="status" className={`text-[13px] font-medium ${note.ok ? "text-ink-2" : "text-accent-text"}`}>
            {note.text}
          </p>
        )}
      </div>
    </section>
  );
}
