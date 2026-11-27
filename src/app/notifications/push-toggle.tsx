"use client";

import { useEffect, useState, useTransition } from "react";
import { disablePush, enablePush, pushState, type PushState } from "./push";

const COPY: Record<PushState, string> = {
  unsupported: "Este navegador no recibe avisos.",
  "install-first": "En iPhone, primero agrega la app a tu pantalla de inicio: Compartir → Agregar a inicio. Luego actívalos desde ahí.",
  denied: "Bloqueaste los avisos para esta app. Puedes permitirlos en los ajustes del navegador.",
  off: "Te avisamos solo lo que necesita de ti: un pago por confirmar, un cambio en tu parte. El resto, en un resumen por la noche.",
  on: "Activados en este teléfono. Solo lo que necesita de ti, y un resumen por la noche.",
};

/** "Avisos en este teléfono": turns Web Push on or off for this device. */
export function PushToggle() {
  const [state, setState] = useState<PushState | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    pushState().then(setState).catch(() => setState("unsupported"));
  }, []);

  if (state === null) return null;
  const canToggle = state === "on" || state === "off";
  const toggle = () => start(async () => setState(await (state === "on" ? disablePush() : enablePush()).catch(() => "off" as const)));

  return (
    <section aria-label="Avisos" className="flex flex-col gap-2.5 rounded-[22px] bg-surface px-4.5 py-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[15px] font-semibold">Avisos en este teléfono</span>
        {canToggle && (
          <button
            type="button"
            role="switch"
            aria-checked={state === "on"}
            onClick={toggle}
            disabled={pending}
            className={`relative h-8 w-[52px] flex-none rounded-full transition-colors ${state === "on" ? "bg-accent" : "bg-tint-2"} disabled:opacity-60`}
          >
            <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-all ${state === "on" ? "left-[24px]" : "left-1"}`} />
            <span className="sr-only">{state === "on" ? "Desactivar avisos" : "Activar avisos"}</span>
          </button>
        )}
      </div>
      <p className="text-[13px] text-muted">{COPY[state]}</p>
    </section>
  );
}
