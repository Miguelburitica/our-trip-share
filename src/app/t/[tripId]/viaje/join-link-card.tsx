"use client";

import { useState, useTransition } from "react";
import { whatsappUrl } from "@/app/ui/cobro";
import { issueJoinLinkAction } from "../actions";

/**
 * The trip's generic link (PRODUCT_SPEC §6.1): one QR or link for the group chat. Whoever opens it
 * picks their name and waits for an admin to approve them.
 */
export function JoinLinkCard(props: { tripId: string; tripName: string; url: string | null; qrSvg: string | null; canManage: boolean }) {
  const [copied, setCopied] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const issue = () =>
    startTransition(async () => {
      const r = await issueJoinLinkAction(props.tripId);
      if (!r.ok) setError(r.message ?? "No se pudo crear el enlace");
      setConfirmRotate(false);
      setCopied(false);
    });

  if (!props.url) {
    if (!props.canManage) return null;
    return (
      <section aria-label="Enlace del viaje" className="flex flex-col gap-3 rounded-[28px] bg-tint px-5 py-5">
        <div className="flex flex-col gap-1">
          <p className="text-[17px] font-semibold">Un enlace para todo el grupo</p>
          <p className="text-[15px] text-ink-2">Compártelo en el chat o muestra el QR. Cada uno elige su nombre y tú lo apruebas.</p>
        </div>
        <button type="button" disabled={pending} onClick={issue} className="min-h-12 rounded-full bg-ink text-[15px] font-semibold text-bg disabled:opacity-60">
          {pending ? "Creando…" : "Crear enlace y QR"}
        </button>
        {error && <p className="text-sm text-accent-text">{error}</p>}
      </section>
    );
  }

  return (
    <section aria-label="Enlace del viaje" className="flex flex-col items-center gap-4 rounded-[28px] bg-surface px-5 py-5 shadow-card">
      <div className="flex w-full flex-col gap-1">
        <p className="text-[17px] font-semibold">Enlace del viaje</p>
        <p className="text-[14px] text-muted">Quien lo abra elige su nombre y espera a que lo apruebes.</p>
      </div>
      {props.qrSvg && (
        <div
          role="img"
          aria-label={`Código QR para unirse a ${props.tripName}`}
          className="size-48 rounded-2xl bg-bg p-2 [&>svg]:size-full"
          dangerouslySetInnerHTML={{ __html: props.qrSvg }}
        />
      )}
      <div className="flex w-full gap-2">
        <a
          href={whatsappUrl(`Únete a *${props.tripName}* en Our Share: ${props.url}`)}
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
      {props.canManage &&
        (confirmRotate ? (
          <div className="flex w-full flex-col gap-2 rounded-2xl bg-accent-soft p-3">
            <p className="text-sm text-accent-text">El enlace y el QR actuales dejarán de funcionar. Quienes ya entraron no se ven afectados.</p>
            <div className="flex gap-2">
              <button type="button" disabled={pending} onClick={issue} className="min-h-11 flex-1 rounded-full bg-accent text-sm font-semibold text-white">
                {pending ? "Cambiando…" : "Cambiar enlace"}
              </button>
              <button type="button" onClick={() => setConfirmRotate(false)} className="min-h-11 flex-1 rounded-full bg-surface text-sm font-semibold">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmRotate(true)} className="min-h-11 text-sm font-semibold text-muted">
            Cambiar enlace
          </button>
        ))}
      {error && <p className="text-sm text-accent-text">{error}</p>}
    </section>
  );
}
