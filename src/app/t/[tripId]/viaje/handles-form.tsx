"use client";

import { useState, useTransition } from "react";
import { HANDLE_LABEL } from "@/app/ui/handles";
import { saveHandlesAction } from "../actions";

type Row = { kind: string; value: string };
const KINDS = Object.keys(HANDLE_LABEL);
const PLACEHOLDER: Record<string, string> = {
  breb: "@tullave o tu número",
  nequi: "300 123 4567",
  daviplata: "300 123 4567",
  bank: "Bancolombia ahorros 123-456789-00",
  paypal: "paypal.me/tu-usuario",
  otro: "Cómo te pueden pagar",
};

/** "Cómo te pagan": shown only to people who owe you, and added to your WhatsApp cobro. */
export function HandlesForm({ tripId, initial }: { tripId: string; initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial.length ? initial : [{ kind: "breb", value: "" }]);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const update = (i: number, patch: Partial<Row>) => {
    setStatus(null);
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };
  const save = () =>
    startTransition(async () => {
      const r = await saveHandlesAction(tripId, rows);
      setStatus(r.ok ? { ok: true, text: "Guardado" } : { ok: false, text: r.message });
    });

  return (
    <section id="pagos" aria-label="Cómo te pagan" className="flex flex-col gap-2.5">
      <div className="flex flex-col px-1">
        <h2 className="text-[15px] font-semibold">Cómo te pagan</h2>
        <p className="text-[13px] text-muted">Solo lo ve quien te debe. Va en tu mensaje de cobro.</p>
      </div>
      <div className="flex flex-col gap-2 rounded-3xl bg-surface p-4 shadow-card">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <select
              aria-label="Tipo"
              value={r.kind}
              onChange={(e) => update(i, { kind: e.target.value })}
              className="h-12 w-[118px] flex-none rounded-2xl bg-tint px-3 text-[14px] font-semibold outline-none"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {HANDLE_LABEL[k]}
                </option>
              ))}
            </select>
            <input
              aria-label={HANDLE_LABEL[r.kind]}
              value={r.value}
              maxLength={80}
              onChange={(e) => update(i, { value: e.target.value })}
              placeholder={PLACEHOLDER[r.kind]}
              className="h-12 min-w-0 flex-1 rounded-2xl bg-tint px-3.5 text-[15px] placeholder:text-muted outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            />
            {rows.length > 1 && (
              <button type="button" aria-label="Quitar" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="w-8 flex-none text-muted">
                ×
              </button>
            )}
          </div>
        ))}
        <div className="flex items-center justify-between pt-1">
          {rows.length < 4 ? (
            <button type="button" onClick={() => setRows((rs) => [...rs, { kind: "nequi", value: "" }])} className="min-h-10 text-[14px] font-semibold text-accent-text">
              + Agregar otra
            </button>
          ) : (
            <span />
          )}
          <span className="flex items-center gap-3">
            {status && <span className={`text-[13px] ${status.ok ? "text-muted" : "text-accent-text"}`}>{status.text}</span>}
            <button type="button" disabled={pending} onClick={save} className="min-h-10 rounded-full bg-ink px-5 text-[14px] font-semibold text-bg disabled:opacity-60">
              {pending ? "…" : "Guardar"}
            </button>
          </span>
        </div>
      </div>
    </section>
  );
}
