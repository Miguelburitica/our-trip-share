"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { fmt, parseAmount } from "@/app/ui/money";
import { CURRENCIES, isCurrencyCode } from "@/shared-kernel/money/currency";
import { FxRate } from "@/shared-kernel/money/fx-rate";
import { deleteSplitGroupAction, quoteRateAction, recordExpenseAction, saveSplitGroupAction, scanReceiptAction } from "../actions";

const CATEGORIES = [
  ["comida", "Comida"],
  ["transporte", "Transporte"],
  ["super", "Súper"],
  ["tragos", "Tragos"],
  ["alojamiento", "Alojamiento"],
  ["planes", "Planes"],
] as const;

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "back"] as const;
const CURRENCY_CODES = Object.keys(CURRENCIES);
const decimalsOf = (code: string) => (isCurrencyCode(code) ? CURRENCIES[code].exponent : 0);

/** "≈ $98.000" in the trip's currency, or null while there's no rate. */
function toBase(amount: number, from: string, to: string, rate: string | null): number | null {
  if (!rate || !amount || !isCurrencyCode(from) || !isCurrencyCode(to)) return null;
  try {
    return FxRate.parse(rate).convert(amount, from, to);
  } catch {
    return null;
  }
}

interface Person {
  id: string;
  name: string;
  initials: string;
}

interface Group {
  id: string;
  name: string;
  seatIds: string[];
  canDelete: boolean;
}

interface Presets {
  participants: string[];
  sameAsLast: string[] | null;
  preselected: boolean;
  groups: Group[];
}

/** Phone photos are 3–12MB: send a 1600px JPEG instead (enough to read, fast on mobile data). */
async function shrinkPhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (blob) return new File([blob], "factura.jpg", { type: "image/jpeg" });
  } catch {
    // Formats the browser can't decode go up as they are; the server checks type and size.
  }
  return file;
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
const andList = (xs: string[]) => new Intl.ListFormat("es", { type: "conjunction" }).format(xs);

export function QuickAdd(props: {
  tripId: string;
  currency: string;
  mySeatId: string;
  people: Person[];
  /** La vaca, if the trip has one: it can pay (never owes). */
  pot?: { id: string; cash: number } | null;
  presets: Presets;
}) {
  const [digits, setDigits] = useState("");
  // The expense's currency; the trip's (props.currency) unless they pick another.
  const [cur, setCur] = useState(props.currency);
  const [quote, setQuote] = useState<{ currency: string; rate: string | null } | null>(null);
  const [cardCharge, setCardCharge] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("otro");
  const [payerId, setPayerId] = useState(props.mySeatId);
  const [choosingPayer, setChoosingPayer] = useState(false);
  const [selected, setSelected] = useState<string[]>(() => props.presets.participants);
  const [groups, setGroups] = useState<Group[]>(props.presets.groups);
  const [naming, setNaming] = useState<string | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ path: string; title: string | null; note: string | null } | null>(null);
  const [scanning, setScanning] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<null | { kind: "saved"; warnings: string[]; held?: boolean; paidBy?: string } | { kind: "error"; message: string }>(null);
  const [pending, startTransition] = useTransition();

  const foreign = cur !== props.currency;
  const decimals = decimalsOf(cur);
  const amount = decimals ? (parseAmount(digits, cur) ?? 0) : Number(digits || "0");
  const rate = quote?.currency === cur ? quote.rate : null;
  const charged = cardCharge === null ? null : parseAmount(cardCharge, props.currency);
  const approxBase = foreign ? (charged ?? toBase(amount, cur, props.currency, rate)) : null;

  useEffect(() => {
    if (!foreign) return;
    let live = true;
    quoteRateAction(props.tripId, cur).then((r) => live && setQuote({ currency: cur, rate: r.ok ? r.rate : null }));
    return () => {
      live = false;
    };
  }, [cur, foreign, props.tripId]);

  const pickCurrency = (code: string) => {
    setStatus(null);
    setCur(code);
    setDigits("");
    setCardCharge(null);
  };
  const payers: Person[] = props.pot ? [...props.people, { id: props.pot.id, name: "la vaca", initials: "V" }] : props.people;
  const payer = payers.find((p) => p.id === payerId) ?? payers[0];
  const potPays = props.pot != null && payer.id === props.pot.id;
  const potShort = potPays && !foreign && amount > props.pot!.cash;
  const n = selected.length;
  const each = Math.floor(amount / Math.max(n, 1));
  const perPerson = !n || !amount ? "Elige quiénes" : amount % n ? `${fmt(each, cur)}–${fmt(each + 1, cur)} c/u` : `${fmt(each, cur)} c/u`;

  const press = (k: (typeof KEYS)[number]) => {
    setStatus(null);
    setDigits((d) => {
      if (k === "back") return d.slice(0, -1);
      if (decimals && k === "000") return d.includes(",") ? d : (d || "0") + ",";
      if (d === "" && (k === "0" || k === "000")) return d;
      if (decimals && d.includes(",") && d.length - d.indexOf(",") > decimals) return d;
      const next = d + k;
      return next.replace(",", "").length > 10 ? d : next;
    });
  };
  const toggle = (id: string) => {
    setStatus(null);
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };
  const cannotSave = amount === 0 || n === 0 || pending;

  const everyone = props.people.map((p) => p.id);
  const matchedGroup = groups.find((g) => sameSet(g.seatIds, selected));
  const sameAsLast = props.presets.sameAsLast;
  const missing = props.people.filter((p) => !selected.includes(p.id)).map((p) => (p.id === props.mySeatId ? "tú" : p.name));
  const splitLabel =
    n === 0
      ? "Elige quiénes"
      : n === props.people.length
        ? "Entre todos"
        : matchedGroup
          ? `${matchedGroup.name} · ${n} ${n === 1 ? "persona" : "personas"}`
          : n === 1
            ? selected[0] === props.mySeatId
              ? "Solo tú"
              : `Solo ${props.people.find((p) => p.id === selected[0])?.name}`
            : missing.length <= 2
              ? `Todos menos ${andList(missing)}`
              : `Entre ${n} personas`;

  const scan = async (file: File) => {
    setStatus(null);
    setScanning(true);
    try {
      const form = new FormData();
      form.set("tripId", props.tripId);
      form.set("photo", await shrinkPhoto(file));
      const r = await scanReceiptAction(form);
      if (!r.ok) {
        setStatus({ kind: "error", message: r.message });
        return;
      }
      setReceipt({ path: r.receiptPath, title: r.title, note: r.note ?? (r.read ? null : "Foto adjunta. Escribe el monto.") });
      if (r.currency && r.currency !== cur && CURRENCY_CODES.includes(r.currency)) {
        setCur(r.currency);
        setCardCharge(null);
      }
      if (r.amount) {
        const d = decimalsOf(r.currency ?? cur);
        setDigits(d ? `${Math.floor(r.amount / 10 ** d)},${String(r.amount % 10 ** d).padStart(d, "0")}` : String(r.amount));
      }
      if (r.category) setCategory(r.category);
    } catch {
      setStatus({ kind: "error", message: "No se pudo subir la foto. Intenta de nuevo." });
    } finally {
      setScanning(false);
    }
  };

  const pick = (ids: string[]) => {
    setStatus(null);
    setNaming(null);
    setSelected(ids);
  };
  const saveGroup = (name: string) =>
    startTransition(async () => {
      const r = await saveSplitGroupAction(props.tripId, name, selected);
      if (r.ok) {
        setGroups((gs) => [...gs, r.group]);
        setNaming(null);
        setGroupError(null);
      } else setGroupError(r.message);
    });
  const deleteGroup = (g: Group) =>
    startTransition(async () => {
      const r = await deleteSplitGroupAction(props.tripId, g.id);
      if (r.ok) setGroups((gs) => gs.filter((x) => x.id !== g.id));
      else setGroupError(r.message ?? "No se pudo borrar");
    });
  const chip = (on: boolean) => `min-h-[38px] flex-none rounded-full px-3.5 text-[13px] font-semibold ${on ? "bg-ink text-bg" : "bg-tint"}`;

  const save = () =>
    startTransition(async () => {
      const result = await recordExpenseAction({
        tripId: props.tripId,
        amount,
        currency: cur,
        cardCharge: foreign ? charged : null,
        category,
        payerSeatId: payer.id,
        participantIds: selected,
        title: receipt?.title ?? undefined,
        receiptPath: receipt?.path ?? null,
      });
      if (result.ok) {
        setStatus({ kind: "saved", warnings: result.warnings, held: result.held, paidBy: payer.id === props.mySeatId ? undefined : potPays ? "la vaca" : payer.name });
        setDigits("");
        setReceipt(null);
        setCardCharge(null);
      } else {
        setStatus({ kind: "error", message: result.message });
      }
    });

  return (
    <main className="fixed inset-0 z-30 mx-auto flex max-w-[480px] flex-col gap-4 overflow-y-auto bg-bg px-5 pt-5 pb-6 *:shrink-0 [@media(max-height:860px)]:gap-2.5 [@media(max-height:860px)]:pt-3 [@media(max-height:860px)]:pb-4">
      <header className="flex min-h-11 items-center justify-between">
        <Link href={`/t/${props.tripId}`} aria-label="Cerrar" className="flex size-11 items-center justify-center rounded-full bg-tint">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </Link>
        <h1 className="text-[17px] font-semibold">Nuevo gasto</h1>
        <label className="relative flex min-h-11 items-center gap-1 rounded-full bg-tint px-3.5 text-sm font-semibold">
          {cur}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
          <select
            aria-label="Moneda del gasto"
            value={cur}
            onChange={(e) => pickCurrency(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {[props.currency, ...CURRENCY_CODES.filter((c) => c !== props.currency)].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="flex flex-col items-center gap-1.5 py-2 [@media(max-height:860px)]:py-0">
        <output aria-live="polite" className={`tabular text-[54px] leading-tight [@media(max-height:860px)]:text-[44px] font-bold tracking-tight ${amount ? "" : "text-placeholder"}`}>
          {fmt(amount, cur)}
        </output>
        {foreign && (
          <span className="flex flex-wrap items-center justify-center gap-x-2 text-[13px] text-muted">
            {cardCharge !== null ? (
              <label className="flex items-center gap-1.5 font-semibold text-ink">
                La tarjeta cobró
                <input
                  inputMode="decimal"
                  autoFocus
                  value={cardCharge}
                  onChange={(e) => setCardCharge(e.target.value)}
                  placeholder={props.currency}
                  aria-label={`Lo que cobró la tarjeta en ${props.currency}`}
                  className="h-8 w-28 rounded-full bg-tint px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                />
              </label>
            ) : (
              <span>
                {approxBase !== null
                  ? `≈ ${fmt(approxBase, props.currency)}`
                  : quote?.currency === cur && !rate
                    ? "Sin tasa por ahora: queda pendiente"
                    : "Buscando la tasa…"}
              </span>
            )}
            <button
              type="button"
              onClick={() => setCardCharge(cardCharge === null ? "" : null)}
              className="min-h-8 font-semibold text-accent-text"
            >
              {cardCharge === null ? "¿Cuánto cobró la tarjeta?" : "Usar la tasa del día"}
            </button>
          </span>
        )}
        {status?.kind === "saved" && status.held && (
          <span className="max-w-[300px] text-center text-[13px] font-medium text-accent-text">
            Cambia el saldo de alguien que ya pagó, así que cuenta cuando un admin lo apruebe.
          </span>
        )}
        {status?.kind === "saved" && status.warnings.length > 0 && (
          <span className="text-[13px] font-medium text-accent-text">{status.warnings.join(" · ")}</span>
        )}
        {status?.kind === "error" && <span role="alert" className="text-[13px] font-medium text-accent-text">{status.message}</span>}
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void scan(file);
          }}
        />
        {receipt ? (
          <span className="flex max-w-full items-center gap-1 rounded-full bg-tint py-1 pr-1 pl-3.5 text-[13px] font-semibold">
            <CameraIcon />
            <span className="truncate">{receipt.title ? `Factura · ${receipt.title}` : "Factura adjunta"}</span>
            <button type="button" aria-label="Quitar la factura" onClick={() => setReceipt(null)} className="flex size-7 flex-none items-center justify-center rounded-full">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </span>
        ) : (
          <button
            type="button"
            disabled={scanning}
            onClick={() => photoInput.current?.click()}
            className="flex h-9 items-center gap-1.5 rounded-full bg-tint px-3.5 text-[13px] font-semibold disabled:opacity-60"
          >
            <CameraIcon />
            {scanning ? "Leyendo la factura…" : "Foto de la factura"}
          </button>
        )}
        {receipt?.note && !amount && <span className="text-[13px] font-medium text-accent-text">{receipt.note}</span>}
      </div>

      <div role="group" aria-label="Categoría" className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]">
        {CATEGORIES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={category === id}
            onClick={() => setCategory(category === id ? "otro" : id)}
            className={`min-h-[42px] flex-none rounded-full px-4 text-sm font-semibold ${category === id ? "bg-ink text-bg" : "bg-tint"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {choosingPayer ? (
        <section aria-label="¿Quién pagó?" className="flex flex-col gap-3 rounded-3xl bg-surface p-4 shadow-card">
          <span className="text-[15px] font-semibold">¿Quién pagó?</span>
          <div role="radiogroup" aria-label="Quién pagó" className="-mx-4 flex gap-3 overflow-x-auto px-4 [scrollbar-width:none]">
            {payers.map((p) => {
              const on = p.id === payer.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setPayerId(p.id);
                    setChoosingPayer(false);
                    setStatus(null);
                  }}
                  className="flex w-[54px] flex-none flex-col items-center gap-1.5"
                >
                  <span className={`flex size-11 items-center justify-center rounded-full text-sm font-semibold ${on ? "bg-ink text-bg" : "bg-tint"}`}>
                    {p.initials}
                  </span>
                  <span className={`max-w-full truncate text-xs ${on ? "font-semibold" : "text-muted"}`}>
                    {p.id === props.mySeatId ? "Tú" : p.id === props.pot?.id ? "La vaca" : p.name}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : (
      <button
        type="button"
        aria-label={`Pagó ${payer.id === props.mySeatId ? "tú" : payer.name}. Cambiar quién pagó`}
        onClick={() => setChoosingPayer(true)}
        className="flex min-h-[50px] items-center gap-2.5 rounded-full bg-tint py-1.5 pr-4 pl-1.5 text-left"
      >
        <span className="flex size-[38px] items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-bg">{payer.initials}</span>
        <span className="text-[15px] font-semibold">Pagó {payer.id === props.mySeatId ? "tú" : payer.name}</span>
        {potPays ? (
          <span className={`ml-auto text-[13px] ${potShort ? "font-semibold text-accent-text" : "text-muted"}`}>
            {potShort ? `La vaca solo tiene ${fmt(Math.max(0, props.pot!.cash), props.currency)}` : `Tiene ${fmt(props.pot!.cash, props.currency)}`}
          </span>
        ) : (
          <span className="ml-auto text-[13px] font-semibold text-muted">Cambiar</span>
        )}
      </button>
      )}

      <section className="flex flex-col gap-3 rounded-3xl bg-surface p-4 shadow-card [@media(max-height:860px)]:gap-2 [@media(max-height:860px)]:py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-semibold">{splitLabel}</span>
          <span className="tabular text-sm text-muted">{perPerson}</span>
        </div>
        <div role="group" aria-label="Quiénes participan" className="flex justify-between">
          {props.people.map((p) => {
            const on = selected.includes(p.id);
            return (
              <button key={p.id} type="button" aria-pressed={on} aria-label={`${on ? "Quitar a" : "Agregar a"} ${p.name}`} onClick={() => toggle(p.id)} className="flex w-[50px] flex-col items-center gap-1.5">
                <span
                  className={`flex size-11 items-center justify-center rounded-full text-sm font-semibold ${on ? "bg-ink text-bg" : "border-[1.5px] border-dashed border-dashed bg-surface text-muted"}`}
                >
                  {p.initials}
                </span>
                <span className={`text-xs ${on ? "font-semibold" : "text-muted"}`}>{p.name}</span>
              </button>
            );
          })}
        </div>
        {(n !== props.people.length || sameAsLast || groups.length > 0) && (
        <div role="group" aria-label="Atajos" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          <button type="button" aria-pressed={n === props.people.length} onClick={() => pick(everyone)} className={chip(n === props.people.length)}>
            Todos
          </button>
          {sameAsLast && (
            <button type="button" aria-pressed={sameSet(sameAsLast, selected)} onClick={() => pick(sameAsLast)} className={chip(sameSet(sameAsLast, selected))}>
              Igual que el último
            </button>
          )}
          {groups.map((g) => {
            const on = g === matchedGroup;
            return (
              <span key={g.id} className={`flex flex-none items-center rounded-full ${on ? "bg-ink text-bg" : "bg-tint"}`}>
                <button type="button" aria-pressed={on} onClick={() => pick(g.seatIds)} className={`${chip(on)} ${on && g.canDelete ? "pr-1.5" : ""}`}>
                  {g.name}
                </button>
                {on && g.canDelete && (
                  <button type="button" aria-label={`Borrar el grupo ${g.name}`} disabled={pending} onClick={() => deleteGroup(g)} className="flex size-[38px] items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                )}
              </span>
            );
          })}
          {n >= 2 && n < props.people.length && !matchedGroup && naming === null && (
            <button type="button" onClick={() => setNaming("")} className="min-h-[38px] flex-none rounded-full border-[1.5px] border-dashed border-dashed px-3.5 text-[13px] font-semibold text-muted">
              + Guardar grupo
            </button>
          )}
        </div>
        )}
        {naming !== null && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (naming.trim()) saveGroup(naming);
            }}
            className="flex gap-2"
          >
            <input
              autoFocus
              value={naming}
              onChange={(e) => setNaming(e.target.value)}
              maxLength={30}
              placeholder="Nombre, ej. Carro 1"
              aria-label="Nombre del grupo"
              className="h-11 min-w-0 flex-1 rounded-full bg-tint px-4 text-[15px] placeholder:text-muted outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            />
            <button type="submit" disabled={!naming.trim() || pending} className="h-11 rounded-full bg-ink px-4 text-[14px] font-semibold text-bg disabled:opacity-50">
              Guardar
            </button>
            <button type="button" onClick={() => setNaming(null)} aria-label="Cancelar" className="h-11 px-2 text-[14px] font-semibold text-muted">
              Cancelar
            </button>
          </form>
        )}
        {groupError && <span role="alert" className="text-[13px] font-medium text-accent-text">{groupError}</span>}
      </section>

      <div role="group" aria-label="Teclado" className="mt-auto grid grid-cols-3 gap-1.5 [@media(max-height:860px)]:gap-1">
        {KEYS.map((k) => (
          <button key={k} type="button" onClick={() => press(k)} aria-label={k === "back" ? "Borrar" : k === "000" && decimals ? "Coma decimal" : k} className="flex h-12 items-center justify-center rounded-2xl text-2xl font-medium active:bg-tint [@media(max-height:860px)]:h-10">
            {k === "back" ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
                <path d="m12 9 6 6" />
                <path d="m18 9-6 6" />
              </svg>
            ) : k === "000" && decimals ? (
              ","
            ) : (
              k
            )}
          </button>
        ))}
      </div>

      {status?.kind === "saved" ? (
        <div role="status" className="flex min-h-14 items-center justify-between gap-2.5 rounded-full bg-ink py-1.5 pr-1.5 pl-5.5 text-bg">
          <span className="text-[15px] font-medium">{status.held ? "Falta que lo apruebe un admin" : status.paidBy ? `Guardado · pagó ${status.paidBy}` : "Guardado"}</span>
          <Link href={`/t/${props.tripId}/gastos`} className="flex min-h-11 items-center rounded-full bg-ink-2 px-4.5 text-sm font-semibold">
            Ver gastos
          </Link>
        </div>
      ) : (
        <button
          type="button"
          disabled={cannotSave}
          onClick={save}
          className={`min-h-14 rounded-full text-[17px] font-semibold [@media(max-height:860px)]:min-h-12 ${cannotSave ? "bg-tint-2 text-muted" : "bg-accent text-white"}`}
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
      )}
    </main>
  );
}

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}
