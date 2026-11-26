"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { fmt } from "@/app/ui/money";
import { deleteSplitGroupAction, recordExpenseAction, saveSplitGroupAction } from "../actions";

const CATEGORIES = [
  ["comida", "Comida"],
  ["transporte", "Transporte"],
  ["super", "Súper"],
  ["tragos", "Tragos"],
  ["alojamiento", "Alojamiento"],
  ["planes", "Planes"],
] as const;

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "back"] as const;

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

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
const andList = (xs: string[]) => new Intl.ListFormat("es", { type: "conjunction" }).format(xs);

export function QuickAdd(props: { tripId: string; currency: string; mySeatId: string; people: Person[]; presets: Presets }) {
  const [digits, setDigits] = useState("");
  const [category, setCategory] = useState<string>("otro");
  const [payerIndex, setPayerIndex] = useState(() => Math.max(0, props.people.findIndex((p) => p.id === props.mySeatId)));
  const [selected, setSelected] = useState<string[]>(() => props.presets.participants);
  const [groups, setGroups] = useState<Group[]>(props.presets.groups);
  const [naming, setNaming] = useState<string | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [status, setStatus] = useState<null | { kind: "saved"; warnings: string[] } | { kind: "error"; message: string }>(null);
  const [pending, startTransition] = useTransition();

  const amount = Number(digits || "0");
  const payer = props.people[payerIndex];
  const n = selected.length;
  const perPerson = useMemo(() => {
    if (!n || !amount) return "Elige quiénes";
    const base = Math.floor(amount / n);
    return amount % n ? `${fmt(base, props.currency)}–${fmt(base + 1, props.currency)} c/u` : `${fmt(base, props.currency)} c/u`;
  }, [amount, n, props.currency]);

  const press = (k: (typeof KEYS)[number]) => {
    setStatus(null);
    setDigits((d) => {
      if (k === "back") return d.slice(0, -1);
      if (d === "" && (k === "0" || k === "000")) return d;
      const next = d + k;
      return next.length > 10 ? d : next;
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
        category,
        payerSeatId: payer.id,
        participantIds: selected,
      });
      if (result.ok) {
        setStatus({ kind: "saved", warnings: result.warnings });
        setDigits("");
      } else {
        setStatus({ kind: "error", message: result.message });
      }
    });

  return (
    <main className="fixed inset-0 z-30 mx-auto flex max-w-[480px] flex-col gap-4 overflow-y-auto bg-bg px-5 pt-5 pb-6 *:shrink-0 [@media(max-height:720px)]:gap-2.5 [@media(max-height:720px)]:pt-3 [@media(max-height:720px)]:pb-4">
      <header className="flex min-h-11 items-center justify-between">
        <Link href={`/t/${props.tripId}`} aria-label="Cerrar" className="flex size-11 items-center justify-center rounded-full bg-tint">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </Link>
        <h1 className="text-[17px] font-semibold">Nuevo gasto</h1>
        <span className="flex min-h-11 items-center rounded-full bg-tint px-3.5 text-sm font-semibold">{props.currency}</span>
      </header>

      <div className="flex flex-col items-center gap-1.5 py-2 [@media(max-height:720px)]:py-0">
        <output aria-live="polite" className={`tabular text-[54px] leading-tight [@media(max-height:720px)]:text-[44px] font-bold tracking-tight ${amount ? "" : "text-[#b3a496]"}`}>
          {fmt(amount, props.currency)}
        </output>
        {status?.kind === "saved" && status.warnings.length > 0 && (
          <span className="text-[13px] font-medium text-accent-text">{status.warnings.join(" · ")}</span>
        )}
        {status?.kind === "error" && <span role="alert" className="text-[13px] font-medium text-accent-text">{status.message}</span>}
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

      <button
        type="button"
        onClick={() => setPayerIndex((i) => (i + 1) % props.people.length)}
        className="flex min-h-[50px] items-center gap-2.5 rounded-full bg-tint py-1.5 pr-4 pl-1.5 text-left"
      >
        <span className="flex size-[38px] items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-bg">{payer.initials}</span>
        <span className="text-[15px] font-semibold">Pagó {payer.id === props.mySeatId ? "tú" : payer.name}</span>
      </button>

      <section className="flex flex-col gap-3 rounded-3xl bg-surface p-4 shadow-card [@media(max-height:720px)]:gap-2 [@media(max-height:720px)]:py-3">
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

      <div role="group" aria-label="Teclado" className="mt-auto grid grid-cols-3 gap-1.5 [@media(max-height:720px)]:gap-1">
        {KEYS.map((k) => (
          <button key={k} type="button" onClick={() => press(k)} aria-label={k === "back" ? "Borrar" : k} className="flex h-12 items-center justify-center rounded-2xl text-2xl font-medium active:bg-tint [@media(max-height:720px)]:h-10">
            {k === "back" ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
                <path d="m12 9 6 6" />
                <path d="m18 9-6 6" />
              </svg>
            ) : (
              k
            )}
          </button>
        ))}
      </div>

      {status?.kind === "saved" ? (
        <div role="status" className="flex min-h-14 items-center justify-between gap-2.5 rounded-full bg-ink py-1.5 pr-1.5 pl-5.5 text-bg">
          <span className="text-[15px] font-medium">Guardado</span>
          <Link href={`/t/${props.tripId}/gastos`} className="flex min-h-11 items-center rounded-full bg-ink-2 px-4.5 text-sm font-semibold">
            Ver gastos
          </Link>
        </div>
      ) : (
        <button
          type="button"
          disabled={cannotSave}
          onClick={save}
          className={`min-h-14 rounded-full text-[17px] font-semibold [@media(max-height:720px)]:min-h-12 ${cannotSave ? "bg-tint-2 text-muted" : "bg-accent text-white"}`}
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
      )}
    </main>
  );
}
