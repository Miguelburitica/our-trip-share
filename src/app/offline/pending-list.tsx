"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { syncPending } from "./client";
import { PENDING_CHANGED, pendingStore } from "./pending-store";
import type { PendingExpense } from "./sync";

/** Expenses of this trip still on the phone: "esperan señal", or rejected by the server. */
export function PendingExpenses() {
  const { tripId } = useParams<{ tripId: string }>();
  const router = useRouter();
  const [items, setItems] = useState<PendingExpense[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    const load = () =>
      pendingStore
        .list()
        .then((all) => live && setItems(all.filter((p) => p.tripId === tripId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))))
        .catch(() => {});
    load();
    window.addEventListener(PENDING_CHANGED, load);
    return () => {
      live = false;
      window.removeEventListener(PENDING_CHANGED, load);
    };
  }, [tripId]);

  if (items.length === 0) return null;
  const waiting = items.filter((p) => p.status === "waiting").length;

  const retry = async () => {
    setBusy(true);
    const report = await syncPending().catch(() => null);
    setBusy(false);
    if (report && report.sent > 0) router.refresh();
  };

  return (
    <section aria-label="Gastos sin subir" className="flex flex-col gap-2.5 rounded-[22px] bg-accent-soft px-4.5 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex flex-col">
          <span className="text-[15px] font-semibold text-accent-text">
            {waiting === 1 ? "1 gasto espera señal" : waiting > 1 ? `${waiting} gastos esperan señal` : "Gastos sin subir"}
          </span>
          <span className="text-[13px] text-accent-text/80">Están guardados en este teléfono. Se suben solos al volver la conexión.</span>
        </span>
        {waiting > 0 && (
          <button type="button" onClick={retry} disabled={busy} className="flex min-h-11 flex-none items-center rounded-full bg-surface px-4 text-sm font-semibold disabled:opacity-60">
            {busy ? "Subiendo…" : "Subir ya"}
          </button>
        )}
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-3.5 py-2.5">
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[14px] font-semibold">{p.label}</span>
              {p.status === "failed" && <span className="text-[13px] font-medium text-accent-text">No se pudo subir: {p.error}</span>}
            </span>
            {p.status === "failed" && (
              <button type="button" onClick={() => pendingStore.remove(p.id)} className="min-h-11 flex-none px-2 text-[13px] font-semibold text-muted">
                Descartar
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
