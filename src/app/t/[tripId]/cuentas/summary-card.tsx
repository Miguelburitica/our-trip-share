"use client";

import { useState, useTransition } from "react";
import { whatsappUrl } from "@/app/ui/cobro";
import { summaryLinkAction } from "./actions";

/**
 * "Compartir resumen": a read-only page with totals, balances and who pays whom, for the group chat
 * (no sign-in, no expense details). Admins create, replace or turn it off; anyone can share it.
 */
export function SummaryCard(props: { tripId: string; tripName: string; url: string | null; canManage: boolean }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (on: boolean) =>
    startTransition(async () => {
      setError(null);
      setCopied(false);
      const r = await summaryLinkAction(props.tripId, on);
      if (!r.ok) setError(r.message);
    });

  if (!props.url && !props.canManage) return null;
  return (
    <section aria-label="Compartir resumen" className="flex flex-col gap-3 rounded-[28px] bg-surface px-5 py-5 shadow-card">
      <div className="flex flex-col gap-1">
        <p className="text-[17px] font-semibold">Resumen para el grupo</p>
        <p className="text-[14px] text-muted">
          Un enlace de solo lectura con los totales y quién le paga a quién. No muestra los gastos uno por uno.
        </p>
      </div>
      {props.url ? (
        <>
          <div className="flex gap-2">
            <a
              href={whatsappUrl(`Cuentas de *${props.tripName}*: ${props.url}`)}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-ink text-[15px] font-semibold text-bg"
            >
              WhatsApp
            </a>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard?.writeText(props.url!);
                setCopied(true);
              }}
              className="min-h-12 flex-1 rounded-full bg-tint text-[15px] font-semibold"
            >
              {copied ? "Copiado" : "Copiar enlace"}
            </button>
          </div>
          <div className="flex justify-center gap-5">
            <a href={props.url} target="_blank" rel="noreferrer" className="min-h-11 content-center text-[15px] font-semibold text-accent-text">
              Ver resumen
            </a>
            {props.canManage && (
              <button type="button" disabled={pending} onClick={() => run(false)} className="min-h-11 text-[15px] font-semibold text-muted">
                Desactivar
              </button>
            )}
          </div>
        </>
      ) : (
        <button type="button" disabled={pending} onClick={() => run(true)} className="min-h-12 rounded-full bg-ink text-[15px] font-semibold text-bg disabled:opacity-60">
          {pending ? "Creando…" : "Crear enlace del resumen"}
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-accent-text">
          {error}
        </p>
      )}
    </section>
  );
}
