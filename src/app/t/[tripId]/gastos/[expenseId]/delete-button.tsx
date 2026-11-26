"use client";

import { useState, useTransition } from "react";
import { deleteExpenseAction } from "../../actions";

/** Two taps on purpose: deleting changes everyone's balances. */
export function DeleteExpenseButton({ tripId, expenseId }: { tripId: string; expenseId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="min-h-11 self-center px-4 text-[15px] font-semibold text-accent-text">
        Borrar gasto
      </button>
    );
  }
  return (
    <div role="alertdialog" aria-label="Confirmar borrado" className="flex flex-col gap-3 rounded-3xl bg-accent-soft p-4">
      <p className="text-[15px] font-semibold text-accent-text">¿Borrar este gasto?</p>
      <p className="-mt-2 text-sm text-accent-text/80">Sale de las cuentas de todos. Queda registrado en el historial.</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await deleteExpenseAction(tripId, expenseId);
              if (r && !r.ok) setError(r.message);
            })
          }
          className="min-h-12 flex-1 rounded-full bg-accent text-[15px] font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Borrando…" : "Sí, borrar"}
        </button>
        <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="min-h-12 flex-1 rounded-full bg-surface text-[15px] font-semibold">
          Cancelar
        </button>
      </div>
      {error && <p role="alert" className="text-sm font-medium text-accent-text">{error}</p>}
    </div>
  );
}
