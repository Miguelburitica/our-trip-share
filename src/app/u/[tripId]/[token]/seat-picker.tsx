"use client";

import { useState, useTransition } from "react";
import { ui } from "@/app/ui/styles";
import { requestJoinAction } from "./actions";

export function SeatPicker(props: { tripId: string; token: string; seats: Array<{ id: string; firstName: string; waiting: boolean }> }) {
  const [choice, setChoice] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isNew = choice === "new";
  const picked = props.seats.find((s) => s.id === choice);
  const ready = isNew ? newName.trim().length > 0 : !!picked;

  const send = () =>
    startTransition(async () => {
      setError(null);
      const r = await requestJoinAction(props.tripId, props.token, isNew ? { newName } : { seatId: choice! });
      if (r) setError(r.message);
    });

  return (
    <div className="flex flex-col gap-5">
      <div role="radiogroup" aria-label="¿Quién eres?" className="flex flex-wrap gap-2">
        {props.seats.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={choice === s.id}
            disabled={s.waiting}
            onClick={() => setChoice(s.id)}
            className={`min-h-12 rounded-full px-5 text-[16px] font-semibold disabled:opacity-40 ${choice === s.id ? "bg-ink text-bg" : "bg-tint"}`}
          >
            {s.firstName}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={isNew}
          onClick={() => setChoice("new")}
          className={`min-h-12 rounded-full border-[1.5px] border-dashed border-dashed px-5 text-[16px] font-semibold ${isNew ? "bg-ink text-bg" : "text-muted"}`}
        >
          No estoy en la lista
        </button>
      </div>
      {isNew && (
        <label className="flex flex-col gap-1.5">
          <span className={ui.label}>Tu nombre</span>
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} placeholder="Como te dicen en el grupo" className={ui.input} />
        </label>
      )}
      {error && <p className={ui.error}>{error}</p>}
      <button type="button" disabled={!ready || pending} onClick={send} className={ui.primary}>
        {pending ? "Enviando…" : picked ? `Soy ${picked.firstName}` : isNew && newName.trim() ? `Entrar como ${newName.trim()}` : "Elige tu nombre"}
      </button>
    </div>
  );
}
