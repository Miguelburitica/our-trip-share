"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { amountInput, fmt, parseAmount } from "@/app/ui/money";
import { rebalance, type SplitRow } from "@/app/ui/split";
import { editSplitAction } from "../../actions";

/**
 * "Editar reparto": type what someone actually consumed and the rest rebalances equally among the
 * others; untick people who weren't there. Saves only when the amounts add up to the total.
 */
export function SplitEditor(props: {
  tripId: string;
  expenseId: string;
  version: number;
  currency: string;
  total: number;
  canEditTotal: boolean;
  people: Array<{ id: string; name: string }>;
  shares: Array<{ seatId: string; amount: number }>;
  wasExact: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const initialRows = (): SplitRow[] =>
    props.people.map((p) => {
      const share = props.shares.find((s) => s.seatId === p.id);
      return { seatId: p.id, included: !!share, fixed: props.wasExact && share ? share.amount : null };
    });
  const [rows, setRows] = useState<SplitRow[]>(initialRows);
  const [totalText, setTotalText] = useState(amountInput(props.total, props.currency));
  // What's being typed in a per-person field, kept raw so "12," survives in USD/EUR.
  const [typing, setTyping] = useState<{ seatId: string; text: string } | null>(null);
  const whole = !/[.,]/.test(amountInput(1, props.currency));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const total = parseAmount(totalText, props.currency) ?? 0;
  const { amounts, remainder } = useMemo(() => rebalance(total, rows), [total, rows]);
  const included = rows.filter((r) => r.included);
  const anyFixed = included.some((r) => r.fixed !== null);
  const canSave = total > 0 && included.length > 0 && remainder === 0 && !pending;

  const update = (seatId: string, patch: Partial<SplitRow>) => {
    setError(null);
    setRows((rs) => rs.map((r) => (r.seatId === seatId ? { ...r, ...patch } : r)));
  };
  const open = () => {
    setRows(initialRows());
    setTotalText(amountInput(props.total, props.currency));
    setError(null);
    dialog.current?.showModal();
  };
  const save = () =>
    startTransition(async () => {
      const r = await editSplitAction({
        tripId: props.tripId,
        expenseId: props.expenseId,
        expectedVersion: props.version,
        amount: total,
        split: anyFixed
          ? { method: "exact", shares: included.map((x) => ({ seatId: x.seatId, amount: amounts.get(x.seatId) ?? 0 })) }
          : { method: "equal", participants: included.map((x) => x.seatId) },
      });
      if (r.ok) dialog.current?.close();
      else setError(r.message);
    });

  return (
    <>
      <button type="button" onClick={open} className="flex min-h-12 items-center justify-center rounded-full bg-tint text-[15px] font-semibold">
        Editar reparto
      </button>
      <dialog
        ref={dialog}
        aria-label="Editar reparto"
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        className="m-0 mx-auto mt-auto max-h-[92dvh] w-full max-w-[480px] rounded-t-[32px] bg-bg p-0 text-ink backdrop:bg-[rgba(43,36,32,.4)]"
      >
        <div className="flex flex-col gap-4 px-5 pt-3 pb-8">
          <span aria-hidden="true" className="mx-auto h-1.5 w-10 rounded-full bg-tint-2" />
          <header className="flex items-center justify-between">
            <h2 className="text-[17px] font-semibold">Editar reparto</h2>
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Cerrar" className="flex size-11 items-center justify-center rounded-full bg-tint">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </header>

          <label className="flex items-center justify-between gap-3 rounded-2xl bg-tint px-4 py-2">
            <span className="text-[15px] font-semibold">Total</span>
            <input
              value={totalText}
              disabled={!props.canEditTotal}
              inputMode={whole ? "numeric" : "decimal"}
              onChange={(e) => {
                const units = parseAmount(e.target.value, props.currency);
                setTotalText(units === null ? "" : whole ? amountInput(units, props.currency) : e.target.value);
              }}
              className="tabular h-11 w-40 bg-transparent text-right text-[20px] font-bold outline-none disabled:text-ink"
            />
          </label>
          <p className="-mt-2 px-1 text-[13px] text-muted">Escribe lo que consumió cada uno; el resto se reparte igual entre los demás.</p>

          <ul className="flex flex-col">
            {props.people.map((p) => {
              const row = rows.find((r) => r.seatId === p.id)!;
              const value = row.included ? (amounts.get(p.id) ?? 0) : null;
              return (
                <li key={p.id} className="flex min-h-[56px] items-center gap-3">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={row.included}
                    aria-label={`${p.name} participa`}
                    onClick={() => update(p.id, { included: !row.included, fixed: null })}
                    className={`flex size-7 flex-none items-center justify-center rounded-full ${row.included ? "bg-ink text-bg" : "border-[1.5px] border-dashed border-dashed"}`}
                  >
                    {row.included && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                  <span className={`flex-1 text-[15px] font-semibold ${row.included ? "" : "text-muted"}`}>{p.name}</span>
                  {row.fixed !== null && (
                    <button type="button" onClick={() => update(p.id, { fixed: null })} className="text-[12px] font-semibold text-accent-text">
                      Igual
                    </button>
                  )}
                  <input
                    aria-label={`Lo que le toca a ${p.name}`}
                    disabled={!row.included}
                    inputMode={whole ? "numeric" : "decimal"}
                    value={typing?.seatId === p.id && !whole ? typing.text : value === null ? "" : amountInput(value, props.currency)}
                    placeholder="—"
                    onFocus={(e) => e.target.select()}
                    onBlur={() => setTyping(null)}
                    onChange={(e) => {
                      setTyping({ seatId: p.id, text: e.target.value });
                      update(p.id, { fixed: parseAmount(e.target.value, props.currency) ?? 0 });
                    }}
                    className={`tabular h-11 w-32 rounded-xl px-3 text-right text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                      row.fixed !== null ? "bg-accent-soft font-bold text-accent-text" : "bg-tint font-semibold"
                    } disabled:bg-transparent`}
                  />
                </li>
              );
            })}
          </ul>

          <p role="status" className={`px-1 text-[14px] font-semibold ${remainder === 0 ? "text-muted" : "text-accent-text"}`}>
            {included.length === 0
              ? "Elige al menos una persona"
              : remainder > 0
                ? `Faltan ${fmt(remainder, props.currency)} por repartir`
                : remainder < 0
                  ? `Te pasaste por ${fmt(-remainder, props.currency)}`
                  : anyFixed
                    ? "Cuadra con el total"
                    : `Partes iguales entre ${included.length}`}
          </p>
          {error && (
            <p role="alert" className="rounded-2xl bg-accent-soft px-4 py-3 text-[15px] text-accent-text">
              {error}
            </p>
          )}
          <button type="button" disabled={!canSave} onClick={save} className="min-h-14 rounded-full bg-accent text-[17px] font-semibold text-white disabled:bg-tint-2 disabled:text-muted">
            {pending ? "Guardando…" : "Guardar reparto"}
          </button>
        </div>
      </dialog>
    </>
  );
}
