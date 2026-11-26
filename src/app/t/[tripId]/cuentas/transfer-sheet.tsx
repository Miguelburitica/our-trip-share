"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { cobroMessage, whatsappUrl } from "@/app/ui/cobro";
import { fmt } from "@/app/ui/money";
import { confirmSettlementAction, disputeSettlementAction, recordSettlementAction, type SettleResult } from "./actions";

const METHODS = [
  ["breb", "Bre-B"],
  ["nequi", "Nequi"],
  ["cash", "Efectivo"],
  ["daviplata", "Daviplata"],
  ["bank", "Banco"],
] as const;

const HANDLE_KEY = "ourshare:handle";

function readHandle() {
  try {
    return localStorage.getItem(HANDLE_KEY) ?? "";
  } catch {
    return "";
  }
}
const noSubscribe = () => () => {};
/** Browser-only values without a hydration mismatch: the server snapshot is "". */
const useBrowser = (read: () => string) => useSyncExternalStore(noSubscribe, read, () => "");

function writeHandle(v: string) {
  try {
    localStorage.setItem(HANDLE_KEY, v);
  } catch {
    // Private mode or blocked storage: the handle just isn't remembered.
  }
}

export interface SheetTransfer {
  from: string;
  to: string;
  amount: number;
  pendingSettlementId: string | null;
  /** The pending payment's amount, which can differ from what the plan says is owed now. */
  pendingAmount?: number;
}

/**
 * A plan row that involves me opens a sheet: Cobrar when I'm owed (WhatsApp cobro, "Ya me pagó",
 * or confirm a pending payment) and Pagar when I owe ("Ya pagué"). Rows between other people stay
 * plain text.
 */
export function TransferRow(props: {
  tripId: string;
  tripName: string;
  currency: string;
  transfer: SheetTransfer;
  mySeatId: string;
  /** Display names; "Tú" is resolved here. */
  names: Record<string, string>;
  initiallyOpen?: boolean;
}) {
  const { transfer: t, mySeatId, names } = props;
  const collecting = t.to === mySeatId;
  const paying = t.from === mySeatId;
  const label = (id: string) => (id === mySeatId ? "Tú" : (names[id] ?? "Alguien"));
  const subtitle = t.pendingSettlementId
    ? collecting
      ? `${names[t.from]} dice que ya te pagó`
      : paying
        ? "Le avisaste · falta que confirme"
        : "Dice que ya pagó · por confirmar"
    : collecting
      ? "Te paga a ti"
      : paying
        ? "Tú pagas"
        : "Entre ellos";

  const dialog = useRef<HTMLDialogElement>(null);
  const [session, setSession] = useState(0);
  useEffect(() => {
    if (props.initiallyOpen) dialog.current?.showModal();
  }, [props.initiallyOpen]);

  const row = (
    <>
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="text-[15px] font-semibold">
          {label(t.from)} → {label(t.to)}
        </span>
        <span className={`text-[13px] ${t.pendingSettlementId && collecting ? "font-semibold text-accent-text" : "text-muted"}`}>{subtitle}</span>
      </span>
      <span className="tabular text-[15px] font-semibold">{fmt(t.amount, props.currency)}</span>
    </>
  );

  if (!collecting && !paying) return <li className="flex min-h-[58px] items-center gap-3">{row}</li>;

  return (
    <li>
      <button type="button" onClick={() => dialog.current?.showModal()} className="flex min-h-[58px] w-full items-center gap-3">
        {row}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="text-muted" aria-hidden="true">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>
      <dialog
        ref={dialog}
        aria-label={collecting ? `Cobrarle a ${names[t.from]}` : `Pagarle a ${names[t.to]}`}
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        onClose={() => setSession((n) => n + 1)}
        className="m-0 mx-auto mt-auto w-full max-w-[480px] rounded-t-[32px] bg-bg p-0 text-ink backdrop:bg-[rgba(43,36,32,.4)]"
      >
        <SheetBody key={session} {...props} collecting={collecting} close={() => dialog.current?.close()} />
      </dialog>
    </li>
  );
}

function SheetBody(props: {
  tripId: string;
  tripName: string;
  currency: string;
  transfer: SheetTransfer;
  names: Record<string, string>;
  collecting: boolean;
  close: () => void;
}) {
  const { transfer: t, names, collecting } = props;
  const other = collecting ? names[t.from] : names[t.to];
  const storedHandle = useBrowser(readHandle);
  const origin = useBrowser(() => window.location.origin);
  const [edited, setHandle] = useState<string | null>(null);
  const handle = edited ?? storedHandle;
  const [method, setMethod] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<SettleResult>) =>
    startTransition(async () => {
      setError(null);
      const r = await action();
      if (r.ok) props.close();
      else setError(r.message);
    });

  const record = () =>
    method && run(() => recordSettlementAction({ tripId: props.tripId, from: t.from, to: t.to, amount: t.amount, method }));

  const message = () =>
    cobroMessage({
      debtorName: names[t.from],
      tripName: props.tripName,
      amount: t.amount,
      currency: props.currency,
      handle,
      detailUrl: `${origin}/t/${props.tripId}/cuentas`,
    });

  const methodPicker = (
    <div role="group" aria-label={collecting ? "Cómo te pagó" : "Cómo le pagaste"} className="flex flex-wrap gap-2">
      {METHODS.map(([id, text]) => (
        <button
          key={id}
          type="button"
          aria-pressed={method === id}
          onClick={() => setMethod(id)}
          className={`min-h-[42px] rounded-full px-4 text-sm font-semibold ${method === id ? "bg-ink text-bg" : "bg-tint"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-5 px-5 pt-3 pb-8">
      <span aria-hidden="true" className="mx-auto h-1.5 w-10 rounded-full bg-tint-2" />
      <header className="flex items-center justify-between">
        <h2 className="text-[17px] font-semibold">{collecting ? `Cobrarle a ${other}` : `Pagarle a ${other}`}</h2>
        <button type="button" onClick={props.close} aria-label="Cerrar" className="flex size-11 items-center justify-center rounded-full bg-tint">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </header>

      <div className="flex flex-col items-center gap-1">
        <span className={`tabular text-[44px] leading-tight font-bold tracking-tight ${collecting ? "" : "text-accent-text"}`}>
          {fmt(t.pendingSettlementId ? (t.pendingAmount ?? t.amount) : t.amount, props.currency)}
        </span>
        <span className="text-sm text-muted">
          {t.pendingSettlementId
            ? collecting
              ? `Pago de ${other} · por confirmar`
              : `Tu pago a ${other} · por confirmar`
            : collecting
              ? `${other} te debe de ${props.tripName}`
              : `Le debes a ${other}`}
        </span>
      </div>

      {t.pendingSettlementId && collecting ? (
        <>
          <p className="rounded-2xl bg-accent-soft px-4 py-3 text-[15px] text-accent-text">
            {other} dice que ya te pagó. Revisa tu cuenta antes de confirmar.
          </p>
          <button type="button" disabled={pending} onClick={() => run(() => confirmSettlementAction(props.tripId, t.pendingSettlementId!))} className="min-h-14 rounded-full bg-accent text-[17px] font-semibold text-white disabled:opacity-50">
            Sí, me llegó
          </button>
          <button type="button" disabled={pending} onClick={() => run(() => disputeSettlementAction(props.tripId, t.pendingSettlementId!))} className="min-h-12 rounded-full bg-tint text-[15px] font-semibold disabled:opacity-50">
            No me llegó
          </button>
        </>
      ) : t.pendingSettlementId ? (
        <p className="rounded-2xl bg-tint px-4 py-3 text-[15px]">
          Le avisaste a {other}. Falta que confirme que le llegó; si no lo hace, se confirma solo en 3 días.
        </p>
      ) : collecting ? (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="px-1 text-[15px] font-semibold">Tu llave o número (opcional)</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              onBlur={() => writeHandle(handle.trim())}
              placeholder="Bre-B @mateo o Nequi 300…"
              maxLength={60}
              className="h-[54px] w-full rounded-2xl bg-tint px-4 text-[17px] placeholder:text-muted outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            />
            <span className="px-1 text-[13px] text-muted">Va en el mensaje. Solo se guarda en este teléfono.</span>
          </label>
          <a
            href={whatsappUrl(message())}
            onClick={() => writeHandle(handle.trim())}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-14 items-center justify-center rounded-full bg-accent text-[17px] font-semibold text-white"
          >
            Enviar cobro por WhatsApp
          </a>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard?.writeText(message());
              setCopied(true);
            }}
            className="-mt-2 min-h-11 text-[15px] font-semibold text-accent-text"
          >
            {copied ? "Mensaje copiado" : "Copiar mensaje"}
          </button>
          <div className="flex flex-col gap-3 rounded-3xl bg-surface p-4 shadow-card">
            <span className="text-[15px] font-semibold">¿Ya te pagó? ¿Cómo?</span>
            {methodPicker}
            <button type="button" disabled={!method || pending} onClick={record} className="min-h-12 rounded-full bg-ink text-[15px] font-semibold text-bg disabled:bg-tint-2 disabled:text-muted">
              {pending ? "Guardando…" : "Ya me pagó"}
            </button>
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard?.writeText(String(t.amount));
              setCopied(true);
            }}
            className="-mt-2 min-h-11 text-[15px] font-semibold text-accent-text"
          >
            {copied ? "Monto copiado" : "Copiar monto"}
          </button>
          <span className="px-1 text-[15px] font-semibold">¿Cómo le pagaste?</span>
          {methodPicker}
          <button type="button" disabled={!method || pending} onClick={record} className="min-h-14 rounded-full bg-accent text-[17px] font-semibold text-white disabled:bg-tint-2 disabled:text-muted">
            {pending ? "Guardando…" : "Ya pagué"}
          </button>
          <p className="px-1 text-[13px] text-muted">{other} confirma cuando le llegue.</p>
        </>
      )}

      {error && (
        <p role="alert" className="rounded-2xl bg-accent-soft px-4 py-3 text-[15px] text-accent-text">
          {error}
        </p>
      )}
    </div>
  );
}
