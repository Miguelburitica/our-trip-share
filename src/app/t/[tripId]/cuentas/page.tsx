import Link from "next/link";
import { fmt } from "@/app/ui/money";
import { loadTrip } from "../data";
import { TransferRow } from "./transfer-sheet";

const MODES = [
  { id: "simplified", label: "Simplificado", hint: "Las menos transferencias posibles." },
  { id: "hub", label: "Vía organizador", hint: "Todos le pagan al organizador y él reparte." },
  { id: "direct", label: "Directo", hint: "Cada quien le paga a quien le pagó algo." },
] as const;

export default async function Cuentas({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ modo?: string; abrir?: string }>;
}) {
  const [{ tripId: raw }, { modo, abrir }] = await Promise.all([params, searchParams]);
  const { c, principal, tripId, trip, nameOf } = await loadTrip(raw);
  const mode = MODES.find((m) => m.id === modo)?.id ?? trip.settleMode;
  // Previewing hub mode uses the owner as hub until the trip picks one.
  const result = await c.settlement.getTripBalances(principal, tripId, mode === "hub" && !trip.hubSeatId ? "simplified" : mode);
  if (!result.ok) throw new Error("No pudimos calcular las cuentas");
  const b = result.value;
  const planMode = mode === "hub" && !trip.hubSeatId ? "simplified" : mode;
  const [mine, toPay] = await Promise.all([
    c.settlement.getMyHandles(principal, tripId),
    c.settlement.getHandlesToPay(principal, tripId, planMode),
  ]);
  const myHandles = mine.ok ? mine.value : [];
  const handlesOf = (seatId: string) => (toPay.ok ? (toPay.value.find((h) => h.seatId === seatId)?.handles ?? null) : null);
  const max = Math.max(1, ...b.balances.map((x) => Math.abs(x.balance)));
  const current = MODES.find((m) => m.id === mode)!;
  const names = Object.fromEntries(trip.seats.map((s) => [s.id, s.displayName]));
  // ?abrir=<seat> (from Inicio's Cobrar/Pagar) opens my transfer with that person.
  // Pending payments that no longer match a plan row (the plan moved after they were sent) still
  // need the receiver's answer, so they get their own list.
  const looseRows = b.pending
    .filter((p) => (p.from === b.mySeatId || p.to === b.mySeatId) && !b.plan.some((t) => t.pendingSettlementId === p.id))
    .map((p) => ({ from: p.from, to: p.to, amount: p.baseAmount, pendingSettlementId: p.id, pendingAmount: p.baseAmount }));
  const openKey = b.plan.find((t) => (t.from === b.mySeatId && t.to === abrir) || (t.to === b.mySeatId && t.from === abrir));

  return (
    <main className="flex flex-col gap-6 px-5 pt-14 pb-36">
      <header className="flex flex-col gap-1.5 px-1">
        <h1 className="text-3xl font-bold tracking-tight">Cuentas</h1>
        <p className="text-[15px] text-muted">
          {b.myBalance === 0 ? (
            "Estás a paz y salvo"
          ) : (
            <>
              {b.myBalance > 0 ? "Te deben " : "Debes "}
              <strong className="font-bold text-ink">{fmt(Math.abs(b.myBalance), b.baseCurrency)}</strong>
            </>
          )}
        </p>
      </header>

      <div className="flex flex-col gap-2.5">
        <nav aria-label="Cómo saldar" className="grid grid-cols-3 gap-1 rounded-full bg-tint p-1">
          {MODES.map((m) => (
            <Link
              key={m.id}
              href={`/t/${tripId}/cuentas?modo=${m.id}`}
              aria-current={m.id === mode ? "page" : undefined}
              className={`flex min-h-[42px] items-center justify-center rounded-full text-[13px] font-semibold ${m.id === mode ? "bg-surface shadow-card" : "text-muted"}`}
            >
              {m.label}
            </Link>
          ))}
        </nav>
        <p className="px-2 text-sm text-muted">
          {current.hint}
          {mode === "hub" && !trip.hubSeatId && " Elige quién recibe en Viaje › Ajustes."}
        </p>
      </div>

      <section aria-label="Plan de pagos" className="flex flex-col gap-2.5">
        <h2 className="px-1 text-sm font-semibold text-muted">{b.plan.length} transferencias</h2>
        <ul className="rounded-3xl bg-surface px-4.5 py-1 shadow-card">
          {b.plan.map((t) => (
            <TransferRow
              key={`${t.from}-${t.to}`}
              tripId={tripId}
              tripName={trip.name}
              currency={b.baseCurrency}
              transfer={{ ...t, pendingAmount: b.pending.find((p) => p.id === t.pendingSettlementId)?.baseAmount }}
              mySeatId={b.mySeatId}
              names={names}
              myHandles={myHandles}
              theirHandles={handlesOf(t.to)}
              initiallyOpen={t === openKey}
            />
          ))}
          {b.plan.length === 0 && <li className="py-4 text-muted">Todos están a paz y salvo.</li>}
        </ul>
      </section>

      {looseRows.length > 0 && (
        <section aria-label="Por confirmar" className="flex flex-col gap-2.5">
          <h2 className="px-1 text-sm font-semibold text-muted">Por confirmar</h2>
          <ul className="rounded-3xl bg-surface px-4.5 py-1 shadow-card">
            {looseRows.map((t) => (
              <TransferRow
                key={t.pendingSettlementId}
                tripId={tripId}
                tripName={trip.name}
                currency={b.baseCurrency}
                transfer={t}
                mySeatId={b.mySeatId}
                names={names}
                myHandles={myHandles}
                theirHandles={handlesOf(t.to)}
              />
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Saldo por persona" className="flex flex-col gap-3 px-1">
        <h2 className="text-sm font-semibold text-muted">Saldo por persona</h2>
        {[...b.balances]
          .sort((x, y) => y.balance - x.balance)
          .map((x) => (
            <div key={x.seatId} className="grid grid-cols-[64px_1fr_104px] items-center gap-2.5 text-sm">
              <span className="font-medium">{nameOf(x.seatId)}</span>
              <span className="relative h-2 overflow-hidden rounded-full bg-tint">
                <span
                  className={`absolute inset-y-0 left-0 rounded-full ${x.balance >= 0 ? "bg-ink" : "bg-accent"}`}
                  style={{ width: `${Math.max(3, Math.round((Math.abs(x.balance) / max) * 100))}%` }}
                />
              </span>
              <span className={`tabular text-right font-semibold ${x.balance < 0 ? "text-accent-text" : ""}`}>
                {x.balance > 0 ? "+" : ""}
                {fmt(x.balance, b.baseCurrency)}
              </span>
            </div>
          ))}
      </section>
    </main>
  );
}
