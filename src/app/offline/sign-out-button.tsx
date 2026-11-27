"use client";

import { useTransition } from "react";
import { signOutAction } from "@/app/t/[tripId]/actions";
import { forgetEverything } from "./client";
import { pendingStore } from "./pending-store";

/** "Cerrar sesión" that also wipes this phone's offline copies, warning about unsent expenses first. */
export function SignOutButton() {
  const [pending, start] = useTransition();
  const signOut = () =>
    start(async () => {
      const waiting = (await pendingStore.list().catch(() => [])).filter((p) => p.status === "waiting").length;
      if (waiting > 0) {
        const n = waiting === 1 ? "1 gasto que aún no sube" : `${waiting} gastos que aún no suben`;
        if (!window.confirm(`Tienes ${n}. Si cierras sesión ahora, se pierden. ¿Cerrar sesión igual?`)) return;
      }
      await forgetEverything();
      await signOutAction();
    });
  return (
    <button type="button" onClick={signOut} disabled={pending} className="min-h-11 text-[15px] text-muted">
      {pending ? "Cerrando…" : "Cerrar sesión"}
    </button>
  );
}
