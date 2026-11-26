"use client";

import { useState, useTransition } from "react";
import { fmt } from "@/app/ui/money";
import { reviewShareAction } from "./cuentas/actions";

/**
 * "Revisa tu parte" (PRODUCT_SPEC §6.6): once the trip is Liquidando, each person checks the
 * expenses they're in and says "Todo bien" or asks the organizer, privately.
 */
export function ReviewCard(props: {
  tripId: string;
  currency: string;
  total: number;
  items: Array<{ id: string; title: string; share: number }>;
  question: string | null;
}) {
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState(props.question ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const send = (status: "ok" | "question") =>
    startTransition(async () => {
      setError(null);
      const r = await reviewShareAction(props.tripId, status, status === "question" ? note : undefined);
      if (!r.ok) setError(r.message);
      else setAsking(false);
    });

  return (
    <section aria-label="Revisa tu parte" className="flex flex-col gap-4 rounded-[28px] bg-surface px-5 py-5 shadow-card">
      <div className="flex flex-col gap-1">
        <h2 className="text-[17px] font-semibold">Revisa tu parte</h2>
        <p className="text-[15px] text-ink-2">
          Te tocan <strong className="tabular font-semibold text-ink">{fmt(props.total, props.currency)}</strong> en{" "}
          {props.items.length === 1 ? "1 gasto" : `${props.items.length} gastos`}.
        </p>
      </div>

      {props.items.length > 0 && (
        <details className="group -mx-1 rounded-2xl bg-tint px-4 py-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[15px] font-semibold">
            Ver mis gastos
            <span aria-hidden className="text-muted transition-transform group-open:rotate-90">›</span>
          </summary>
          <ul className="flex flex-col pb-2">
            {props.items.map((i) => (
              <li key={i.id} className="flex min-h-10 items-center justify-between gap-3 text-[15px]">
                <span className="truncate">{i.title}</span>
                <span className="tabular font-semibold">{fmt(i.share, props.currency)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {props.question && !asking && (
        <div className="flex flex-col gap-0.5 rounded-2xl bg-accent-soft px-4 py-3 text-accent-text">
          <p className="text-[15px] font-semibold">“{props.question}”</p>
          <p className="text-[13px] text-accent-text/80">Tu pregunta. La ve quien organiza el viaje, en Cuentas.</p>
        </div>
      )}

      {asking ? (
        <div className="flex flex-col gap-2.5">
          <label htmlFor="review-note" className="px-1 text-[15px] font-semibold">
            ¿Qué no te cuadra?
          </label>
          <textarea
            id="review-note"
            value={note}
            maxLength={280}
            rows={3}
            autoFocus
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ej: yo no fui a la lancha"
            className="w-full resize-none rounded-2xl bg-tint px-4 py-3 text-[16px] outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent/50"
          />
          <p className="px-1 text-[13px] text-muted">Solo la ven tú y quien organiza el viaje.</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || !note.trim()}
              onClick={() => send("question")}
              className="min-h-12 flex-1 rounded-full bg-ink text-[15px] font-semibold text-bg disabled:bg-tint-2 disabled:text-muted"
            >
              {pending ? "Enviando…" : "Enviar pregunta"}
            </button>
            <button type="button" disabled={pending} onClick={() => setAsking(false)} className="min-h-12 flex-1 rounded-full bg-tint text-[15px] font-semibold">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => send("ok")}
            className="min-h-12 flex-1 rounded-full bg-accent text-[15px] font-semibold text-white disabled:opacity-60"
          >
            {props.question ? "Ya me quedó claro" : "Todo bien"}
          </button>
          <button type="button" disabled={pending} onClick={() => setAsking(true)} className="min-h-12 flex-1 rounded-full bg-tint text-[15px] font-semibold">
            {props.question ? "Cambiar pregunta" : "Tengo una pregunta"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-accent-text">
          {error}
        </p>
      )}
    </section>
  );
}
