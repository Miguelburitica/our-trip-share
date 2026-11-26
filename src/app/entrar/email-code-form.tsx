"use client";

import { useState, useTransition } from "react";
import { ui } from "@/app/ui/styles";
import { sendCodeAction, verifyCodeAction } from "./actions";

/** Two steps on one screen: email, then the 6-digit code from that email. */
export function EmailCodeForm({ next, cta }: { next: string; cta: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const send = () =>
    startTransition(async () => {
      setError(null);
      const r = await sendCodeAction(email, next);
      if (r.ok) setSentTo(email.trim().toLowerCase());
      else setError(r.message);
    });

  const verify = () =>
    startTransition(async () => {
      setError(null);
      const r = await verifyCodeAction(sentTo!, code, next);
      if (r && !r.ok) setError(r.message);
    });

  if (!sentTo) {
    return (
      <form action={send} className="flex flex-col gap-3">
        <label htmlFor="email" className={ui.label}>
          Tu correo
        </label>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="nombre@correo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={ui.input}
        />
        {error && <p className={ui.error}>{error}</p>}
        <button type="submit" disabled={pending || !email} className={`${ui.primary} mt-3`}>
          {pending ? "Enviando…" : cta}
        </button>
      </form>
    );
  }

  return (
    <form action={verify} className="flex flex-col gap-3">
      <label htmlFor="code" className={ui.label}>
        Código de 6 dígitos
      </label>
      <p className={ui.hint}>Lo enviamos a {sentTo}</p>
      <input
        id="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        required
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        className={`${ui.input} tabular text-center text-[28px] font-semibold tracking-[0.4em]`}
      />
      {error && <p className={ui.error}>{error}</p>}
      <button type="submit" disabled={pending || code.length !== 6} className={`${ui.primary} mt-3`}>
        {pending ? "Revisando…" : "Continuar"}
      </button>
      <button
        type="button"
        onClick={() => {
          setSentTo(null);
          setCode("");
          setError(null);
        }}
        className={`${ui.link} self-center py-2`}
      >
        Usar otro correo
      </button>
    </form>
  );
}
