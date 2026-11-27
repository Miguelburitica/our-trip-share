"use client";

import { useActionState } from "react";
import { ui } from "@/app/ui/styles";
import { createTripAction } from "./actions";

const CURRENCIES = [
  ["COP", "Peso colombiano"],
  ["USD", "Dólar"],
  ["EUR", "Euro"],
  ["MXN", "Peso mexicano"],
  ["BRL", "Real"],
  ["PEN", "Sol"],
  ["DOP", "Peso dominicano"],
] as const;

export function CreateTripForm() {
  const [state, action, pending] = useActionState(createTripAction, null);
  return (
    <form action={action} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="name" className={ui.label}>
          ¿A dónde van?
        </label>
        <input id="name" name="name" required maxLength={80} placeholder="Cartagena" className={ui.input} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="displayName" className={ui.label}>
          Tu nombre
        </label>
        <input
          id="displayName"
          name="displayName"
          required
          maxLength={60}
          autoComplete="given-name"
          placeholder="Como te dicen en el grupo"
          className={ui.input}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="people" className={ui.label}>
          ¿Quiénes más van?
        </label>
        <textarea
          id="people"
          name="people"
          rows={3}
          placeholder="Ana, Juli, Caro, Leo"
          className={`${ui.input} h-auto resize-none py-3.5 leading-snug`}
        />
        <p className={ui.hint}>Separados por comas. Puedes agregar más después.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <label htmlFor="startDate" className={ui.label}>
            Desde
          </label>
          <input id="startDate" name="startDate" type="date" className={ui.input} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="endDate" className={ui.label}>
            Hasta
          </label>
          <input id="endDate" name="endDate" type="date" className={ui.input} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="currency" className={ui.label}>
          Moneda del viaje
        </label>
        <select id="currency" name="currency" defaultValue="COP" className={`${ui.input} appearance-none`}>
          {CURRENCIES.map(([code, name]) => (
            <option key={code} value={code}>
              {code} · {name}
            </option>
          ))}
        </select>
        <p className={ui.hint}>Las cuentas finales se hacen en esta moneda.</p>
      </div>
      {state && <p className={ui.error}>{state.message}</p>}
      <button type="submit" disabled={pending} className={`${ui.primary} mt-2`}>
        {pending ? "Creando…" : "Crear viaje"}
      </button>
    </form>
  );
}
