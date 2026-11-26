"use client";

import { useState, useTransition } from "react";
import { ui } from "@/app/ui/styles";
import { joinWithInviteAction } from "./actions";

export function JoinButton({ tripId, token, seatName }: { tripId: string; token: string; seatName: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {error && <p className={ui.error}>{error}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await joinWithInviteAction(tripId, token);
            if (r) setError(r.message);
          })
        }
        className={ui.primary}
      >
        {pending ? "Entrando…" : `Entrar como ${seatName}`}
      </button>
    </div>
  );
}
